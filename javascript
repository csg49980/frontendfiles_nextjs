const sidebarItems = document.querySelectorAll('.sidebar-nav li');
const workspace = document.getElementById('workspace');
const lockToggle = document.getElementById('lockToggle');
const appContainer = document.getElementById('pmsApp');

let isLocked = true;

// Toggle lock/unlock
lockToggle.addEventListener('click', () => {
  isLocked = !isLocked;
  appContainer.classList.toggle('locked', isLocked);
  lockToggle.textContent = isLocked ? '🔒 Lock' : '🔓 Unlock';
});

// Create draggable tile
sidebarItems.forEach(item => {
  item.addEventListener('click', () => {
    if (isLocked) return;

    const tile = document.createElement('div');
    tile.classList.add('tile');
    tile.textContent = item.textContent;

    tile.style.top = `${Math.random() * 400}px`;
    tile.style.left = `${Math.random() * 400}px`;

    makeDraggable(tile);
    workspace.appendChild(tile);
  });
});

// Basic drag logic
function makeDraggable(element) {
  let offsetX = 0, offsetY = 0, isDragging = false;

  element.addEventListener('mousedown', (e) => {
    if (isLocked) return;

    isDragging = true;
    offsetX = e.clientX - element.offsetLeft;
    offsetY = e.clientY - element.offsetTop;
    element.classList.add('draggable');
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging || isLocked) return;

    element.style.left = `${e.clientX - offsetX}px`;
    element.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      element.classList.remove('draggable');
    }
  });
}
