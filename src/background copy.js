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
	bg_translateCaption: bg_translateCaption
});

const instructions = 
`要求：中文字幕译成南美西班牙语。翻译时要保留跟原文一样的行数。为保持行号对应要强行拆分译文，以解决说话停顿问题。
输出格式：只输出一个一维数组。输出不要带上原文，但译文要带上行号，如：["1.xxx", "2.xxx"]。`

const termsIntructions = `
指定翻译术语：{0}
请开始翻译：
` // 术语：维达=Vinda,沈氏=Grupo Sánchez,沈氏集团=Grupo Sánchez,顾柔=Valeria González


// ======================== 后台api ========================
async function bg_translateCaption(request, sender, sendResponse) {
    apiRequest('tab_showNotification', { message: "翻译中...", notAutoClose: true});
    const { apiKey, captions, terms } = request;
    openai.apiKey = apiKey;

    let devMessage = instructions
    let message = ""
    

    if (terms && Object.keys(terms).length > 0) {
    	let terms_str = ""
        for (let key of Object.keys(terms)) {
            terms_str += `${key}=${terms[key]},`
        }
        message += termsIntructions.replace('{0}', terms_str);
    }

    for (let i = 0; i < captions.length; i++)
        message += `${i+1}.${captions[i]}\n`

    console.log("开始翻译\n", `devMessage=${devMessage}\nmessage=${message}`)
    // ======================== 开始翻译 ========================
    let translation = null
    let usage = null

    if (isTesting) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        translation = testTramslation
        usage = testUsage
    }
    else {
        // 调用OpenAI API进行翻译
        try  {
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: instructions },
                    { role: "user", content: message }
                ],
                model: "deepseek-reasoner", // "deepseek-chat",deepseek-reasoner
                temperature: 1.3 // 翻译 1.3 比较好
            });
            translation = completion.choices[0].message.content;
            usage = completion.usage
        }
        catch (e) {
            console.error("OpenAI API错误:", e);
            apiRequest('tab_showNotification', { message: "OpenAI API错误:" + e });
            sendResponse({translation: null});
            return;
        }
    }
    // ======================== 处理结果 ========================
    console.log("完成翻译\n", usage, translation)
    
    if (translation) {
        storage.set(storage.last_translation, translation);
        console.log("保存翻译到storage")
    }
    apiRequest('tab_showTranslation', { translation, usage });
    sendResponse({translation});
}

const isTesting = false
const testTramslation = `["1.Te mataré", "Hermano mayor Chao", "3. Hermano Chao, no pegues", "4. No olvides que 234.", "5. A partir de hoy", "6. Ella es nuestro", "7. Niño de la fortuna", "8. Calma tu ira", "9. Yo hablaré con ella", "10. Pequeña", "11. Aunque no lo reconozcas", "12. Él sigue siendo tu padre", "13. Es un hecho", "14. Si cooperas", "15. Tendrás una salida", "16. De lo contrario", "17. No dudaré en matarte", "18. ¿Entiendes?", "19. Xue'er tiene la solución", "20. Cuando consigamos el dinero", "21. Iremos al extranjero", "22. Comenzar nueva vida", "23. Hermano Chao", "24. No arruines el plan", "25. Correcto", "26. No arruines el plan", "27. Nunca adivinarías", "28. Con quién estoy cenando", "29. Eres tú", "30. Sergio Gómez", "31. ¡Te atreviste a secuestrar a Lilia!", "32. Esto no es secuestro -", "33. Visité a mi hija", "34. Sergio Gómez te advierto:", "35. Esto es secuestro", "36. Devuélveme a Lilia", "37. Completa e intacta", "38. De inmediato", "39. O si no", "40. No me culpes por ser cruel", "41. ¡Qué descarado!", "42. ¿Acaso", "43. Me estás amenazando?", "44. Ver a mi hija", "45. ¿Es delito?", "46. Mamá", "47. Mamá", "48. No vengas", "49. ¡Mamá!", "50. Sergio Gómez, maldito", "51. No le hagas daño a Lilia", "52. O juro que", "53. Te haré pagar con tu vida"]`
const testUsage = {
    "prompt_tokens": 267,
    "completion_tokens": 987,
    "prompt_cache_hit_tokens": 220,
}