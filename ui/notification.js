import { getConfig } from "../core/configLoader.js";

const config = getConfig();
let notificationQueue = [];
let isShowing = false;

export function showNotification(message, duration = 3000) {
  notificationQueue.push({ message, duration });
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

  let notificationsContainer = document.querySelector('.player-notifications-container');
  if (!notificationsContainer) {
    notificationsContainer = document.createElement('div');
    notificationsContainer.className = 'player-notifications-container';
    document.body.appendChild(notificationsContainer);
  }

  const notification = document.createElement('div');
  notification.className = 'player-notification';
  notification.textContent = message;
  notificationsContainer.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
      if (notificationsContainer.children.length === 0) {
        notificationsContainer.remove();
      }

      processQueue();
    }, 300);
  }, duration);
}
