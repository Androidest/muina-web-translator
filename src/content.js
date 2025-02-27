//  contents that will be injected into the tab page
'use strict';
import {apiRequest, registerApi, mainIconUrl, storage} from './utils.js';

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

	let { usage, translation, startIndex, slotId } = request;

	if (!slotId) 
		slotId = 0;

	let translations = [];
	try {
		translations = JSON.parse(translation)
	}
	catch (e) {
		tab_showNotification({ message: "错误:翻译格式错误!" });
		return;	
	}

	let inputElements = document.querySelectorAll('textarea.OpenVideo-Target');
	inputElements = Array.from(inputElements).slice(startIndex);
	let lineError = ""
	if (inputElements.length !== translations.length) {
		lineError = "错误:数量对不上!";
	}

	// 显示翻译
	const response = await fetch(chrome.runtime.getURL('translated-caption-slot.html'));
	const html = await response.text();

	const count = Math.min(inputElements.length, translations.length);
	for (let i = 0; i < count; i++) {

		const translation = translations[i];
		const inputElem = inputElements[i];

		for (let sid = 0; sid < slotId + 1; sid++) {
			const id = `translation-slot-${sid}`
			// 如果当前slot是指定的slotId
			if (sid == slotId) {
				// 如果翻译容器不存在, 则创建一个新的翻译容器
				let slot = inputElem.parentElement.querySelector(`#${id}`)
				if (slot) {
					inputElem.parentElement.removeChild(slot);
				}
				// 创建翻译容器
				slot = insertSlot(sid, id, inputElem.parentElement);
				onRenderTranslationSlot(slot, translation, inputElem, i);
			}
			// 如果当前slot不是指定的slotId
			else {
				let slot = inputElem.parentElement.querySelector(`#${id}`)
				// 并且当前slot不存在, 则预留空的slot作为占位
				if (!slot) {
					// 创建翻译容器
					slot = insertSlot(sid, id, inputElem.parentElement);
					onRenderTranslationSlot(slot, "---", inputElem, i);
				}
			}
		}
	}
	

	function insertSlot(sid, id, parent) {
		const slot = document.createElement('div');
		slot.id = id;
		slot.innerHTML = html;

		// 调整位置, 确保顺序
		const nextSibling = parent.querySelector(`#translation-slot-${sid+1}`);
		if (nextSibling)
			parent.insertBefore(slot, nextSibling);
		else
			parent.appendChild(slot);

		return slot;
	}

	// 一条字幕翻译
	function onRenderTranslationSlot(slot, text, inputElem, i) {
		// 翻译的字幕
		const transCaptionBtn = slot.querySelector('#translated-caption-btn');
		transCaptionBtn.innerHTML = text;
		transCaptionBtn.addEventListener('click', () => onClickTransBtn(text, inputElem));

		// 左侧猫图标
		const icon = slot.querySelector('#icon')
		icon.src = mainIconUrl; // 猫图标
		icon.addEventListener('click', () => onClickTransIconBtn(i));
	}
	
	if (usage)
		tab_showNotification({ message: `翻译完毕! ${lineError} Tokens: 输入=${usage.prompt_tokens}, 输出=${usage.completion_tokens}, 全部=${usage.total_tokens}` });
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

// 点击翻译后的字幕
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

	// tab_showNotification({ message: `替换成：${translation}`});
}

// 点击翻译字幕左侧的猫图标
async function onClickTransIconBtn(i) {
	const req = await storage.get(storage.last_trans_request)
	const newReq = { ...req, startIndex: i }
	console.log(`从第【${i+1}】行开始重新翻译`)
	await apiRequest('bg_translateCaption', newReq);
	console.log(`翻译完成`)
}

// =========================== 通用函数 =============================
function formatTranslation(translation) {
	return translation.replace(/^\d+\.\s*/, '');
}