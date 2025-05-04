import { getConfig } from "../core/configLoader.js";

const config = getConfig();
let notificationQueue = [];
let isShowing = false;

export function showNotification(message, duration = 2000, group = null) {
  if (group) {
    notificationQueue = notificationQueue.filter(n => n.group !== group);
  }

  notificationQueue.push({ message, duration, group });

  if (!isShowing) {
    processQueue();
  }
}

function processQueue() {
  if (notificationQueue.length === 0) {
    isShowing = false;
    return;
  }

  isShowing = true;
  const { message, duration } = notificationQueue.shift();

  let container = document.querySelector('.player-notifications-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'player-notifications-container';
    document.body.appendChild(container);
  }

  const notification = document.createElement('div');
  notification.className = 'player-notification';
  notification.textContent = message;

  container.appendChild(notification);

  requestAnimationFrame(() => {
    notification.style.opacity = '1';
  });

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      notification.remove();
      if (container.children.length === 0) {
        container.remove();
      }
      processQueue();
    }, 1000);
  }, duration);
}
