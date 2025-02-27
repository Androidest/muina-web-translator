// background script runs when the extension is installed, upgraded, or when the browser starts up
'use strict';
import OpenAI from "openai";
import {apiRequest, registerApi, storage} from './utils.js';

// ======================== 初始化 ========================
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: ''
});

registerApi({
	bg_translateCaption: bg_translateCaption,
    bg_getPromt : bg_getPromt
});

const sys_instructions = 
`你是专业的字幕翻译工具，把输入的中文字幕翻译成拉丁美洲西班牙语字幕。要求输出格式和输入一致。不要把多条字幕翻译成一条，严格保证输出的字幕条数跟输入一样。不要输出任何解释，只输出翻译后的字幕。`
// 术语：维达=Vinda,沈氏=Grupo Sánchez,沈氏集团=Grupo Sánchez,顾柔=Valeria González
const terms_intructions = `指定替换的术语：{0}` 
const history_intructions = `前文：{0}` 
const caption_intructions = `输入：{0}` 

// ======================== 后台api ========================
async function bg_translateCaption(request, sender, sendResponse) {
    apiRequest('tab_showNotification', { message: "翻译中...", notAutoClose: true});
    const group_size = 50
    let { apiKey, captions, terms, startIndex } = request;

    if (!startIndex)
        startIndex = 0

    openai.apiKey = apiKey;
    let messages = [{ role: "system", content: sys_instructions }]

    if (terms && Object.keys(terms).length > 0) {
        // 如果有术语，添加到消息中
    	let terms_str = ""
        for (let key of Object.keys(terms)) {
            terms_str += `${key}=${terms[key]}；`
        }
        messages.push({ 
            role: "user", 
            content: terms_intructions.replace("{0}", terms_str) 
        })
    }
    
    // ======================== 开始翻译 ========================
    let translation_json = null
    let usage = null

    if (isTesting) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        translation_json = testTramslation
        usage = testUsage
    }
    else {
        let formatted_captions = []
        for (let i = 0; i < captions.length; i++) {
            let cap = `${i+1}.${captions[i]}`
            formatted_captions.push(cap)
        }
        
        let last_group = null
        let translated_captions = []

        if (startIndex > 0) {
        	last_group = formatted_captions.slice(0, startIndex)
        }

        // 把字幕分成组发送，太长影响翻译准确度
        for (let i = startIndex; i < formatted_captions.length; i+=group_size) {

            // 只保留system和terms的消息
            messages = messages.slice(0, 2)
            
            // 把最后一组的最后5条字幕作为前置上下文，避免翻译出现连贯性问题
            if (last_group) {
                const last_five = last_group.slice(-5) // 取最后5条字幕
                messages.push({
                    role: "user",
                    content: history_intructions.replace("{0}", JSON.stringify(last_five)) 
                })
            }

            // 添加当前组的字幕，作为最后的用户输入
            let group = formatted_captions.slice(i, i+group_size)
            messages.push({ 
                role: "user", 
                content: caption_intructions.replace("{0}", JSON.stringify(group)) 
            })
            messages.push({
            	role: "assistant", 
                content: "[", 
                prefix: true
            })
            last_group = group

            try  {
                // 调用OpenAI API进行翻译
                const req = {
                    messages,
                    model: "deepseek-chat", // moonshot-v1-8k, kimi-latest-8k, deepseek-chat, deepseek-reasoner
                    temperature: 1.3, // 翻译 1.3 比较好
                    stop: ["]"],
                }
                console.log(`开始一轮翻译\n`, `messages=${JSON.stringify(req)}`)
                const completion = await openai.chat.completions.create(req);
                console.log("完成一轮翻译\n", JSON.stringify(completion))

                // 合并组的翻译结果
                translated_captions = translated_captions.concat(JSON.parse("[" + completion.choices[0].message.content));

                // 合并组的使用量
                if (!usage) {
                    usage = completion.usage
                }
                else {
                    usage.prompt_tokens += completion.usage.prompt_tokens
                    usage.completion_tokens += completion.usage.completion_tokens
                    usage.total_tokens += completion.usage.total_tokens
                }

                // 每轮翻译间隔1秒
                await new Promise(resolve => setTimeout(resolve, 1000)); 
            }
            catch (e) {
                console.error("OpenAI API错误:", e);
                apiRequest('tab_showNotification', { message: "OpenAI API错误:" + e });
                sendResponse({translation: null});
                return;
            }
        }

        translated_captions = captionsToLowerCase(terms, translated_captions);
        await saveLastTranslation(startIndex, translated_captions);
        translation_json = JSON.stringify(translated_captions);
    }
    // ======================== 处理结果 ========================
    console.log("完成翻译\n", usage, translation_json)
    // 保存翻译到storage

    apiRequest('tab_showTranslation', { translation: translation_json, usage, startIndex });
    sendResponse({translation: translation_json});
}

async function bg_getPromt(request, sender, sendResponse) {
    let { captions, terms } = request;

    let prompt = sys_instructions + '\n'

    // 如果有术语，添加到消息中
    if (terms && Object.keys(terms).length > 0) {
    	let terms_str = ""
        for (let key of Object.keys(terms)) {
            terms_str += `${key}=${terms[key]}；`
        }
        prompt += terms_intructions.replace("{0}", terms_str)  + '\n'
    }
    
    // 添加字幕到消息中
    if (captions && captions.length > 0) {
    	let formatted_captions = []
        for (let i = 0; i < captions.length; i++) {
            let cap = `${i+1}.${captions[i]}`
            formatted_captions.push(cap)
        }
        prompt += caption_intructions.replace("{0}", JSON.stringify(formatted_captions)) 
    }
    
    sendResponse({prompt});
    return false;
}

// ======================== 辅助函数 ========================
async function saveLastTranslation(startIndex, translated_captions) {
    let new_translation = translated_captions;
    if (startIndex > 0) {
        // 从storage中获取上次的翻译
        const last_json = await storage.get(storage.last_translation);
        if (last_json) {
            // 合并上次的翻译和本次的翻译
            const last_translation = JSON.parse(last_json);
            new_translation = last_translation.slice(0, startIndex).concat(translated_captions);
        }
    }
    storage.set(storage.last_translation, JSON.stringify(new_translation));
    console.log("保存翻译到storage");
}

function captionsToLowerCase(terms, translated_captions) {
    const termStr = Object.values(terms).join(' ');
    translated_captions = translated_captions.map(text => {
        const first = text.replace(/^\d+\.\s*/, '').split(' ')[0];
        if (!termStr.includes(first)) {
            text = text.replace(first, first.toLowerCase());
        }
        return text;
    });
    return translated_captions;
}

const isTesting = false
const testTramslation = `["1.Te mataré", "Hermano mayor Chao", "3. Hermano Chao, no pegues", "4. No olvides que 234.", "5. A partir de hoy", "6. Ella es nuestro", "7. Niño de la fortuna", "8. Calma tu ira", "9. Yo hablaré con ella", "10. Pequeña", "11. Aunque no lo reconozcas", "12. Él sigue siendo tu padre", "13. Es un hecho", "14. Si cooperas", "15. Tendrás una salida", "16. De lo contrario", "17. No dudaré en matarte", "18. ¿Entiendes?", "19. Xue'er tiene la solución", "20. Cuando consigamos el dinero", "21. Iremos al extranjero", "22. Comenzar nueva vida", "23. Hermano Chao", "24. No arruines el plan", "25. Correcto", "26. No arruines el plan", "27. Nunca adivinarías", "28. Con quién estoy cenando", "29. Eres tú", "30. Sergio Gómez", "31. ¡Te atreviste a secuestrar a Lilia!", "32. Esto no es secuestro -", "33. Visité a mi hija", "34. Sergio Gómez te advierto:", "35. Esto es secuestro", "36. Devuélveme a Lilia", "37. Completa e intacta", "38. De inmediato", "39. O si no", "40. No me culpes por ser cruel", "41. ¡Qué descarado!", "42. ¿Acaso", "43. Me estás amenazando?", "44. Ver a mi hija", "45. ¿Es delito?", "46. Mamá", "47. Mamá", "48. No vengas", "49. ¡Mamá!", "50. Sergio Gómez, maldito", "51. No le hagas daño a Lilia", "52. O juro que", "53. Te haré pagar con tu vida"]`
const testUsage = {
    "prompt_tokens": 267,
    "completion_tokens": 987,
    "total_tokens": 220,
}