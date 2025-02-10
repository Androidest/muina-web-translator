//  contents that will be injected into the tab page
'use strict';
import {apiRequest, registerApi, mainIconUrl} from './utils.js';

// ============================ 初始化 ====================================
registerApi({
	tab_getAllCaption: tab_getAllCaption,
	tab_showNotification: tab_showNotification,
	tab_showTranslation : tab_showTranslation
});

// ============================ 目标tab api =============================
function tab_getAllCaption(request, sender, sendResponse) {

	let captions = [];
	const inputElements = document.querySelectorAll('input[name="source"]');
	inputElements.forEach(element => {
		captions.push(element.value);
	});

	const terms = {}
	const termElements = document.querySelectorAll('div.OpenVideo-Term');
	termElements.forEach(element => {
		for (const child of element.children) {

			const text = child.textContent;
			const parts = text.split(':');
			if (parts.length === 2) {
				const leftPart = parts[0].trim();
				const rightPart = parts[1].trim();
				terms[leftPart] = rightPart;
			}
		}
	});
	sendResponse({ captions, terms });
}

async function tab_showTranslation(request, sender, sendResponse) {

	// 检查数据是否合法
	if (!request || !request.translation){
		return;
	}
	console.log(request.translation);
	console.log(request.usage);

	let translations = [];
	try {
		translations = JSON.parse(request.translation);	
	}
	catch (e) {
		tab_showNotification({ message: "错误:翻译格式错误!" });
		return;	
	}

	const inputElements = document.querySelectorAll('textarea.OpenVideo-Target');
	let lineError = ""
	if (inputElements.length !== translations.length) {
		lineError = "错误:数量对不上!";
	}

	// 显示翻译
	const id = 'translation-container'
	const response = await fetch(chrome.runtime.getURL('translation.html'));
	const html = await response.text();

	const count = Math.min(inputElements.length, translations.length);
	for (let i = 0; i < count; i++) {
		const translation = translations[i];
		const inputElem = inputElements[i];

		// 移除旧的翻译
		let transContainer = inputElem.parentElement.querySelector('#' + id)
		if (transContainer)
			inputElem.parentElement.removeChild(transContainer)
		
		// 将 翻译HTML 插入到页面中
		transContainer = document.createElement('div');
		inputElem.parentElement.appendChild(transContainer);
		transContainer.id = id;
		transContainer.innerHTML = html;

		// 显示翻译
		const trans1 = transContainer.querySelector('#trans-1');
		if (Array.isArray(translation[0])) {
			onLoadTranslationText(trans1, translation[0], inputElem);

			for (let j = 1; j < translation.length; j++) {
				// 创建新的翻译元素
				const newTrans = trans1.cloneNode(true);
				newTrans.id = 'trans-' + (j + 1);
				trans1.parentElement.appendChild(newTrans);
				onLoadTranslationText(newTrans, translation[j], inputElem);
			}
		}
		else {
			onLoadTranslationText(trans1, translation, inputElem);
		}
	}

	function onLoadTranslationText(transElem, text, inputElem) {
		transElem.innerHTML = text;
		transElem.addEventListener('click', () => onClickTransBtn(text, inputElem));
		transElem.parentElement.querySelector('#icon').src = mainIconUrl;
	}
	
	const usage = request.usage;
	if (usage)
		tab_showNotification({ message: `翻译完毕! ${lineError} Tokens: 输入=${usage.prompt_tokens}, 输出=${usage.completion_tokens}, 击中缓存=${usage.prompt_cache_hit_tokens}` });
	else
		tab_showNotification({ message: `翻译完毕! ${lineError}` });
}

var timeout1 = null
var timeout2 = null
async function tab_showNotification(request, sender, sendResponse) {
	const { message, notAutoClose } = request;
	const id = 'popup-container'
	const response = await fetch(chrome.runtime.getURL('notification.html'));
	const html = await response.text();

	// 移除旧的弹出窗口
	clearTimeout(timeout1)
	clearTimeout(timeout2)
	let popupContainer = document.getElementById(id)
	if (popupContainer)
		document.body.removeChild(popupContainer)

	// 将 弹窗HTML 插入到页面中
	popupContainer = document.createElement('div');
	document.body.appendChild(popupContainer);
	popupContainer.id = id;
	popupContainer.innerHTML = html;
	popupContainer.querySelector('#message').innerHTML = message;
	popupContainer.querySelector('#icon').src = mainIconUrl;

	// 控制动效
	timeout1 = setTimeout(() => {
		document.getElementById('popup-window').style.transform = 'none';
		document.getElementById('popup-window').style.opacity = '1';
	}, 200);

	// 显示弹窗, 并在3s后移除
	if (!notAutoClose) {
		timeout2 = setTimeout(() => {
			if (popupContainer.isEqualNode(document.getElementById(id)))
				document.body.removeChild(popupContainer) 
		}, 4000);
	}
}

// ============================ tab上的按钮事件 =============================
function onClickTransBtn(translation, inputElem) {
	// 模拟用户点击输入框, 触发输入框的事件, 网页需要这个事件提前记录输入框原有的内容
	for (const action of ['click', 'pause', 'focus']) {
		const event = new Event(action, { bubbles: true });
		inputElem.dispatchEvent(event);
	}

	// 把翻译内容插入到输入框中
	translation = formatTranslation(translation);
	inputElem.value = translation;

	// 模拟用户输入, 触发输入框的事件, 以触发网页的Form更新和保存逻辑（网页会对比新内容和原有内容决定是否更新并保存）
	for (const action of ['blur', 'input', 'change', 'keyup']) {
		const event = new Event(action, { bubbles: true });
		inputElem.dispatchEvent(event);
	}

	tab_showNotification({ message: `替换成：${translation}`});
}

// =========================== 通用函数 =============================
function formatTranslation(translation) {
	return translation.replace(/^\d+\.\s*/, '');;
}