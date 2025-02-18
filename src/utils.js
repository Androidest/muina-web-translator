// 把请求分发到tab(tab_xxx)上的content.js，或者后台(bg_xxx)上的background.js

const storage = {
	// 存储键
	apiKey: 'api-key',
	prompt: 'prompt',
	last_trans_request: 'last_trans_request',
	last_translation: 'last_translation',
	// 方法
	set: async (key, value) => {
		const data = { [key]: value };
		console.log(`storage set: ${data}`);
		await chrome.storage.sync.set(data);
	},
	get: async (key) => {
		const data = await chrome.storage.sync.get([key]);
		const value = data[key];
		console.log(`storage get: {${key}:${value}}`);
		return value;
	}
}

function apiRequest(api_name, params) {
	if (api_name == null)
		throw new Error('api_name is null');

	return new Promise(async (resolve, reject) => {
		if (api_name.startsWith('tab_')) {
			const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
			const activeTab = tabs[0];
			chrome.tabs.sendMessage(activeTab.id, { type: api_name, ...params }, (response) => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					console.log('tab api:', api_name, response);
					resolve(response);
				}
			});
		} else if (api_name.startsWith('bg_')) {
			chrome.runtime.sendMessage({ type: api_name, ...params }, (response) => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					console.log('tab api:', api_name, response);
					resolve(response);
				}
			});
		} else {
			reject(new Error('Invalid API name'));
		}
	});
}

function registerApi(apiMap) {
	chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
		if (!apiMap[request.type])
			return false;
		apiMap[request.type](request, sender, sendResponse);
		// console.log('Tab api:', request.type, request);
		return true;
	});
}

const mainIconUrl = `${chrome.runtime.getURL('icons/icon_128.png')}`
const mainIconUrl_css = `url(${mainIconUrl})`

export { storage, apiRequest, registerApi, mainIconUrl, mainIconUrl_css };