// ---------- Setup ----------
const DEFAULT_CATEGORIES = [
  { key: 'walikumsalam', label: 'Walikumsalam' },
  { key: 'aslamualikum', label: 'Aslamualikum' },
  { key: 'good-morning', label: 'Good Morning' },
];

const DB_NAME = 'salaamCardsDB';
const DB_VERSION = 1;
const STORE_IMAGES = 'images';
const STORE_CATEGORIES = 'categories';

let db = null;
let currentCategory = 'walikumsalam';
let currentImages = []; // {id, category, src, name, builtin}
let modalImage = null;

// ---------- IndexedDB helpers ----------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const _db = e.target.result;
      if (!_db.objectStoreNames.contains(STORE_IMAGES)) {
        const store = _db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
      }
      if (!_db.objectStoreNames.contains(STORE_CATEGORIES)) {
        _db.createObjectStore(STORE_CATEGORIES, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function idbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

function idbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

function idbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// ---------- State ----------
let customCategories = [];
let userImages = [];

async function loadState() {
  db = await openDB();
  customCategories = await idbGetAll(STORE_CATEGORIES);
  userImages = await idbGetAll(STORE_IMAGES);
}

function allCategories() {
  const extra = customCategories.filter(
    c => !DEFAULT_CATEGORIES.some(d => d.key === c.key)
  );
  return [...DEFAULT_CATEGORIES, ...extra];
}

function imagesForCategory(catKey) {
  const builtins = (typeof BUILTIN_IMAGES !== 'undefined' ? BUILTIN_IMAGES : [])
    .filter(img => img.category === catKey)
    .map(img => ({ ...img, builtin: true }));
  const custom = userImages
    .filter(img => img.category === catKey)
    .map(img => ({ ...img, builtin: false }));
  return [...builtins, ...custom];
}

// ---------- Rendering ----------
const tabsEl = document.getElementById('tabs');
const gridEl = document.getElementById('grid');
const catTitleEl = document.getElementById('catTitle');

function renderTabs() {
  tabsEl.innerHTML = '';
  allCategories().forEach(cat => {
    const count = imagesForCategory(cat.key).length;
    const btn = document.createElement('button');
    btn.className = 'tab' + (cat.key === currentCategory ? ' active' : '');
    btn.innerHTML = `${escapeHtml(cat.label)} <span class="count">${count}</span>`;
    btn.addEventListener('click', () => {
      currentCategory = cat.key;
      renderAll();
    });
    tabsEl.appendChild(btn);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'add-cat-btn';
  addBtn.textContent = '+ New category';
  addBtn.addEventListener('click', addCategory);
  tabsEl.appendChild(addBtn);
}

function renderGrid() {
  const cat = allCategories().find(c => c.key === currentCategory);
  catTitleEl.textContent = cat ? cat.label : '';
  currentImages = imagesForCategory(currentCategory);

  gridEl.innerHTML = '';

  if (currentImages.length === 0) {
    gridEl.innerHTML = `
      <div class="empty">
        <div class="big">No cards here yet</div>
        <p>Tap "Add image" above to upload cards for ${escapeHtml(cat ? cat.label : 'this category')}.</p>
      </div>`;
    return;
  }

  currentImages.forEach(img => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${img.src}" alt="${escapeHtml(img.name || '')}" loading="lazy">
      <div class="hover-mark"><span>Tap to reply →</span></div>
      ${!img.builtin ? '<button class="del-btn" title="Remove">✕</button>' : ''}
    `;
    card.querySelector('img').addEventListener('click', () => openModal(img));
    const delBtn = card.querySelector('.del-btn');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Remove this card?')) {
          await idbDelete(STORE_IMAGES, img.id);
          userImages = userImages.filter(u => u.id !== img.id);
          renderAll();
        }
      });
    }
    gridEl.appendChild(card);
  });
}

function renderAll() {
  renderTabs();
  renderGrid();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Add category ----------
function addCategory() {
  const label = prompt('Name of the new category (e.g. "Jummah Mubarak"):');
  if (!label) return;
  const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!key) return;
  if (allCategories().some(c => c.key === key)) {
    currentCategory = key;
    renderAll();
    return;
  }
  const newCat = { key, label: label.trim() };
  customCategories.push(newCat);
  idbPut(STORE_CATEGORIES, newCat);
  currentCategory = key;
  renderAll();
}

// ---------- Upload ----------
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');

uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    const id = 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const record = { id, category: currentCategory, src: dataUrl, name: file.name };
    userImages.push(record);
    await idbPut(STORE_IMAGES, record);
  }
  fileInput.value = '';
  renderAll();
  showToast(files.length > 1 ? `${files.length} images added` : 'Image added');
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Modal ----------
const modalOverlay = document.getElementById('modalOverlay');
const modalImg = document.getElementById('modalImg');
const modalName = document.getElementById('modalName');
const modalClose = document.getElementById('modalClose');
const shareBtn = document.getElementById('shareBtn');
const copyBtn = document.getElementById('copyBtn');
const openWaWebBtn = document.getElementById('openWaWebBtn');
const downloadBtn = document.getElementById('downloadBtn');
const deleteFromModal = document.getElementById('deleteFromModal');
const statusMsg = document.getElementById('statusMsg');

function openModal(img) {
  modalImage = img;
  modalImg.src = img.src;
  modalName.textContent = img.name || '';
  statusMsg.textContent = '';
  deleteFromModal.style.display = img.builtin ? 'none' : 'block';
  modalOverlay.classList.add('open');
}

function closeModal() {
  modalOverlay.classList.remove('open');
  modalImage = null;
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then(res => res.blob());
}

function fileNameFor(img, ext) {
  const base = (img.name || 'salaam-card').replace(/\.[a-z0-9]+$/i, '').replace(/\s+/g, '-');
  return `${base}.${ext}`;
}

shareBtn.addEventListener('click', async () => {
  if (!modalImage) return;
  statusMsg.textContent = '';
  try {
    const blob = await dataUrlToBlob(modalImage.src);
    const ext = blob.type === 'image/png' ? 'png' : 'jpg';
    const file = new File([blob], fileNameFor(modalImage, ext), { type: blob.type });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      statusMsg.textContent = 'Shared — pick WhatsApp from the menu that opened.';
      return;
    }
    throw new Error('share-not-supported');
  } catch (err) {
    if (err && err.name === 'AbortError') {
      // Person closed the share sheet themselves — do nothing.
      return;
    }
    // Fallback: copy to clipboard so it can still be pasted into WhatsApp.
    try {
      const pngBlob = await dataUrlToPngBlob(modalImage.src);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      statusMsg.textContent = 'Direct share isn\'t available here, so the image was copied instead — open WhatsApp and paste it in the chat.';
      showToast('Image copied to clipboard');
    } catch (err2) {
      statusMsg.textContent = 'Sharing and copying aren\'t available in this browser — use "Download" and attach the image in WhatsApp manually.';
    }
  }
});

copyBtn.addEventListener('click', async () => {
  if (!modalImage) return;
  try {
    const blob = await dataUrlToPngBlob(modalImage.src);
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
    statusMsg.textContent = 'Copied! Now open WhatsApp and paste it in the chat.';
    showToast('Image copied to clipboard');
  } catch (err) {
    statusMsg.textContent = 'Could not copy automatically — try "Download" instead and attach it in WhatsApp.';
  }
});

function dataUrlToPngBlob(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob); else reject(new Error('toBlob failed'));
      }, 'image/png');
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

openWaWebBtn.addEventListener('click', () => {
  window.open('https://web.whatsapp.com/', '_blank');
  statusMsg.textContent = 'WhatsApp Web is opening — paste the copied image into your chat.';
});

downloadBtn.addEventListener('click', () => {
  if (!modalImage) return;
  const a = document.createElement('a');
  a.href = modalImage.src;
  a.download = (modalImage.name || 'salaam-card') + (modalImage.src.startsWith('data:image/png') ? '.png' : '.jpg');
  document.body.appendChild(a);
  a.click();
  a.remove();
});

deleteFromModal.addEventListener('click', async () => {
  if (!modalImage || modalImage.builtin) return;
  if (confirm('Remove this card?')) {
    await idbDelete(STORE_IMAGES, modalImage.id);
    userImages = userImages.filter(u => u.id !== modalImage.id);
    closeModal();
    renderAll();
  }
});

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

// ---------- Init ----------
(async function init() {
  try {
    await loadState();
  } catch (err) {
    console.error('IndexedDB unavailable, custom uploads will not persist.', err);
  }
  renderAll();
})();
