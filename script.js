// State
let ratio = "9:16";
let bgColor = "#000000";
let quality = 1;
const sources = []; // original File objects
let results = [];    // { name, url, blob }

// Elements
const fileInput = document.getElementById("file");
const drop = document.getElementById("drop");
const dropText = document.getElementById("dropText");
const grid = document.getElementById("grid");
const downloadAll = document.getElementById("downloadAll");
const qualitySlider = document.getElementById("quality");
const qVal = document.getElementById("qVal");

// Segmented buttons
function bindSeg(id, onChange) {
  const seg = document.getElementById(id);
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    seg.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    onChange(btn.dataset.v);
    rerenderAll();
  });
}
bindSeg("ratio", (v) => (ratio = v));
bindSeg("bg", (v) => (bgColor = v));

qualitySlider.addEventListener("input", () => {
  quality = parseFloat(qualitySlider.value);
  qVal.textContent = Math.round(quality * 100) + "%";
});
// Re-render once the user releases the slider (avoid reprocessing on every tick)
qualitySlider.addEventListener("change", rerenderAll);

// File picking + drag & drop
fileInput.addEventListener("change", () => handleFiles(fileInput.files));
["dragover", "dragenter"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("over");
  })
);
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("over");
  })
);
drop.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));

async function handleFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  files.forEach((f) => sources.push(f));
  await rerenderAll();
}

// Re-process every source image with the current options
async function rerenderAll() {
  if (!sources.length) return;
  dropText.textContent = "Processing " + sources.length + " image(s)...";

  // Free old object URLs
  results.forEach((r) => URL.revokeObjectURL(r.url));
  results = [];
  grid.innerHTML = "";

  for (const file of sources) {
    try {
      await processFile(file);
    } catch (err) {
      console.error("Failed:", file.name, err);
    }
  }

  downloadAll.disabled = results.length === 0;
  dropText.textContent = "Click or drag images here (multiple allowed)";
}

// Load a File into an HTMLImageElement at full resolution
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

async function processFile(file) {
  const img = await loadImage(file);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  // Target aspect ratio (width / height)
  const [rw, rh] = ratio.split(":").map(Number);
  const targetAR = rw / rh;
  const imageAR = iw / ih;

  // Pad (never crop): keep the larger dimension, expand the other to fit the ratio.
  let canvasW, canvasH;
  if (imageAR > targetAR) {
    // Image is wider than target -> width fixed, add vertical padding
    canvasW = iw;
    canvasH = Math.round(iw / targetAR);
  } else {
    // Image is taller/narrower -> height fixed, add horizontal padding
    canvasH = ih;
    canvasW = Math.round(ih * targetAR);
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Fill background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Center the original image at 1:1 pixels (no scaling => no quality loss)
  const dx = Math.round((canvasW - iw) / 2);
  const dy = Math.round((canvasH - ih) / 2);
  ctx.drawImage(img, dx, dy);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const outName = `${baseName}_${ratio.replace(":", "x")}.jpg`;
  const url = URL.createObjectURL(blob);

  const entry = { name: outName, url, blob };
  results.push(entry);
  renderItem(entry, canvasW, canvasH);
}

// iOS Safari can't save <a download> to Photos — it only goes to Files.
// Detect whether the Web Share API can share files (the path to "Save Image").
function canShareFiles(file) {
  return (
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

function renderItem(entry, w, h) {
  const div = document.createElement("div");
  div.className = "item";

  const img = document.createElement("img");
  img.src = entry.url;
  img.alt = entry.name;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `${entry.name}<br>${w} × ${h} px · ${(entry.blob.size / 1024).toFixed(0)} KB`;

  const file = new File([entry.blob], entry.name, { type: "image/jpeg" });

  const btnRow = document.createElement("div");
  btnRow.className = "btn-row";

  // On devices that support file sharing (iOS/Android), offer Save/Share.
  if (canShareFiles(file)) {
    const shareBtn = document.createElement("button");
    shareBtn.className = "dl share";
    shareBtn.textContent = "Save / Share";
    shareBtn.addEventListener("click", async () => {
      try {
        await navigator.share({ files: [file], title: entry.name });
      } catch (err) {
        if (err && err.name !== "AbortError") console.error(err);
      }
    });
    btnRow.appendChild(shareBtn);
  }

  // Always provide a plain download (desktop / fallback).
  const dl = document.createElement("a");
  dl.className = "dl";
  dl.href = entry.url;
  dl.download = entry.name;
  dl.textContent = "Download";
  btnRow.appendChild(dl);

  div.append(img, meta, btnRow);
  grid.appendChild(div);
}

downloadAll.addEventListener("click", () => {
  results.forEach((r, i) => {
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = r.url;
      a.download = r.name;
      a.click();
    }, i * 150);
  });
});
