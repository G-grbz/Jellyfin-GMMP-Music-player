import { getConfig, updateConfig } from './configLoader.js';
import { getLanguageLabels, getDefaultLanguage } from '../language/index.js';

export function createSettingsModal() {
    const config = getConfig();
    const currentLang = config.defaultLanguage || getDefaultLanguage();
    const labels = getLanguageLabels(currentLang) || {};
    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'settings-modal';
    const modalContent = document.createElement('div');
    modalContent.className = 'settings-modal-content';
    const closeBtn = document.createElement('span');
    closeBtn.className = 'settings-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => modal.style.display = 'none';
    const title = document.createElement('h2-gmmp');
    title.textContent = labels.ayarlarBaslik || 'GP Oynatıcı Ayarları';
    const form = document.createElement('form');
    const languageDiv = document.createElement('div');
    languageDiv.className = 'setting-item';
    const languageLabel = document.createElement('label');
    languageLabel.textContent = labels.defaultLanguage || 'Dil:';
    const languageSelect = document.createElement('select');
    languageSelect.name = 'defaultLanguage';
    const languages = [
        { value: 'tur', label: '🇹🇷 Türkçe' },
        { value: 'eng', label: '🇬🇧 English' },
        { value: 'deu', label: '🇩🇪 Deutsch' },
        { value: 'fre', label: '🇫🇷 Français' },
        { value: 'rus', label: '🇷🇺 Русский' },
    ];

    languages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.value;
        option.textContent = lang.label;
        if (lang.value === config.defaultLanguage) {
            option.selected = true;
        }
        languageSelect.appendChild(option);
    });

    languageDiv.append(languageLabel, languageSelect);

    const limitDiv = document.createElement('div');
    limitDiv.className = 'setting-modal-item';

    const musicLimitContainer = document.createElement('div');
    musicLimitContainer.className = 'setting-item';

    const limitLabel = document.createElement('label');
    limitLabel.textContent = labels.muziklimit || 'Müzik Limiti:';

    const limitInput = document.createElement('input');
    limitInput.type = 'number';
    limitInput.value = config.muziklimit || 100;
    limitInput.name = 'muziklimit';

    musicLimitContainer.append(limitLabel, limitInput);

    const songLimitContainer = document.createElement('div');
    songLimitContainer.className = 'setting-item';

    const sarkilimitLabel = document.createElement('label');
    sarkilimitLabel.textContent = labels.sarkilimit || 'Sayfa başına şarkı sayısı';

    const limitSarki = document.createElement('input');
    limitSarki.type = 'number';
    limitSarki.value = config.sarkilimit || 200;
    limitSarki.name = 'sarkilimit';

    songLimitContainer.append(sarkilimitLabel, limitSarki);

    const albumLimitContainer = document.createElement('div');
    albumLimitContainer.className = 'setting-item';

    const albumlimitLabel = document.createElement('label');
    albumlimitLabel.textContent = labels.albumlimit || 'Sayfa başına albüm sayısı';

    const limitAlbum = document.createElement('input');
    limitAlbum.type = 'number';
    limitAlbum.value = config.albumlimit || 20;
    limitAlbum.name = 'albumlimit';

    albumLimitContainer.append(albumlimitLabel, limitAlbum);

    const groupLimitContainer = document.createElement('div');
    groupLimitContainer.className = 'setting-item';

    const gruplimitLabel = document.createElement('label');
    gruplimitLabel.textContent = labels.gruplimit || 'Gruplama Limiti';
    gruplimitLabel.title = labels.gruplimitTitle || 'Mevcut oynatma listesine ekleme yapılırken gruplama limiti';

    const limitGrup = document.createElement('input');
    limitGrup.type = 'number';
    limitGrup.value = config.gruplimit || 200;
    limitGrup.title = labels.gruplimitTitle || 'Mevcut oynatma listesine ekleme yapılırken gruplama limiti';
    limitGrup.name = 'gruplimit';

    groupLimitContainer.append(gruplimitLabel, limitGrup);

    const id3LimitContainer = document.createElement('div');
    id3LimitContainer.className = 'setting-item';

    const id3limitLabel = document.createElement('label');
    id3limitLabel.textContent = labels.id3limit || 'ID3Tags Limiti';
    id3limitLabel.title = labels.id3limitTitle || 'Id3 etiket sorgulamanın eş zamanlı olarak kaç tane yapılacağı belirleyen değer';

    const limitId3 = document.createElement('input');
    limitId3.type = 'number';
    limitId3.value = config.id3limit || 10;
    limitId3.title = labels.id3limitTitle || 'Id3 etiket sorgulamanın eş zamanlı olarak kaç tane yapılacağı belirleyen değer';
    limitId3.name = 'id3limit';

    id3LimitContainer.append(id3limitLabel, limitId3);

    limitDiv.append(
        musicLimitContainer,
        songLimitContainer,
        albumLimitContainer,
        groupLimitContainer,
        id3LimitContainer
    );

    const btnDiv = document.createElement('div');
    btnDiv.className = 'btn-item';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.textContent = labels.kaydet || 'Kaydet';

    form.onsubmit = (e) => {
    e.preventDefault();
    applySettings(true);
};

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.textContent = labels.uygula || 'Uygula';
    applyBtn.style.marginLeft = '10px';
    applyBtn.onclick = () => {
        applySettings(false);
    };

    btnDiv.append(saveBtn, applyBtn);

function applySettings(reload = false) {
    const formData = new FormData(form);
    const updatedConfig = {
        ...config,
        defaultLanguage: formData.get('defaultLanguage'),
        muziklimit: parseInt(formData.get('muziklimit')),
        albumlimit: parseInt(formData.get('albumlimit')),
        sarkilimit: parseInt(formData.get('sarkilimit')),
        gruplimit: parseInt(formData.get('gruplimit')),
        id3limit: parseInt(formData.get('id3limit')),
    };
    updateConfig(updatedConfig);
    modal.style.display = 'none';
    if (reload) location.reload();
}


    form.append(languageDiv, limitDiv, btnDiv);
    modalContent.append(closeBtn, title, form);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    return modal;
}

export function initSettings() {
    const modal = createSettingsModal();

    return {
        open: () => { modal.style.display = 'block'; },
        close: () => { modal.style.display = 'none'; }
    };
}
