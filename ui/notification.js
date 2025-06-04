import { getConfig } from "../core/configLoader.js";

const config = getConfig();
let notificationQueue = [];
let isShowing = false;

function getNotificationClass(type) {
  const typeMap = {
    success: 'success',
    error: 'error',
    warning: 'warning',
    info: 'info',
    tur: 'info',
    kontrol: 'info',
    addlist: 'addlist',
    db: 'db',
    default: ''
  };
  return typeMap[type] || typeMap.default;
}

export function showNotification(message, duration = 2000, type = 'default') {

  if (config.notificationsEnabled === false) return;

  if (type !== 'default') {
    notificationQueue = notificationQueue.filter(n => n.type !== type);
  }

  notificationQueue.push({ message, duration, type });

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
  const { message, duration, type } = notificationQueue.shift();

  let container = document.querySelector('.notifications-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'notifications-container';
    document.body.appendChild(container);
  }

  const notification = document.createElement('div');
  notification.className = `notification ${getNotificationClass(type)}`;
  notification.innerHTML = message;

  container.appendChild(notification);

  requestAnimationFrame(() => {
    notification.style.transform = 'translateY(0)';
    notification.style.opacity = '1';
  });

  setTimeout(() => {
    notification.style.transform = 'translateY(20px)';
    notification.style.opacity = '0';
    setTimeout(() => {
      notification.remove();
      if (container.children.length === 0) {
        container.remove();
      }
      processQueue();
    }, 300);
  }, duration);
}
