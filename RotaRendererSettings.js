// 初始化变量存储设置
let rendererSettings = {
    type: 'applySettings',
    resolution: '1920x1200',
    framerate: 60,
    bitrate: 8000,
    speed: 20,
    size: 20,

    // --- 新增的数字设置 ---
    hitEffectSize: 30,         // 打击特效大小 (0-50)
    bgBrightness: 75,          // 背景亮度 (0-100)

    // --- 默认的 hitsoundVolume JSON 字符串 ---
    hitsoundVolume: JSON.stringify({
        tap: '80',
        smallSlide: '80',
        bigSlide: '80',
        flick: '80',
        rotate: '80',
        catch: '80',
    })
};

var Renderprogress = 0;

// 监听来自父页面的消息
// 嵌入页面 renderer.html
window.addEventListener('message', (event) => {
    // 检查数据是否是对象
    if (typeof event.data === 'object' && event.data !== null && event.data.type === 'applySettings') {
        const data = event.data;

        const newSettings = {
            ...data,
            // --- 保持分辨率为字符串 ---
            resolution: data.resolution,

            // --- 转换为数字（包括新增的）---
            framerate: parseFloat(data.framerate) || 60,
            bitrate: parseFloat(data.bitrate) || 8000,
            speed: parseFloat(data.speed) || 20,
            size: parseFloat(data.size) || 20,

            hitEffectSize: parseFloat(data.hitEffectSize) || 30, // 新增
            bgBrightness: parseFloat(data.bgBrightness) || 75,   // 新增

            // hitsoundVolume 直接使用传入的 JSON 字符串
            hitsoundVolume: data.hitsoundVolume
        };

        // 确保 hitsoundVolume 是有效的 JSON 字符串
        try {
            JSON.parse(newSettings.hitsoundVolume);
        } catch (e) {
            console.error("Invalid hitsoundVolume JSON received:", data.hitsoundVolume);
            // 恢复默认值，防止渲染器崩溃
            newSettings.hitsoundVolume = rendererSettings.hitsoundVolume;
        }

        // 更新全局设置
        rendererSettings = { ...rendererSettings, ...newSettings };

        // 可以在这里加个日志，方便调试
        console.log('Settings updated:', rendererSettings);
    }
});


class RotaRendererSettings {
    getInfo() {
        return {
            id: 'rotarenderersettings',
            name: 'RotaRenderer 设置',
            blocks: [
                {
                    opcode: 'getSetting',
                    blockType: Scratch.BlockType.REPORTER,
                    text: '获取 [SETTING] 的值',
                    arguments: {
                        SETTING: {
                            type: Scratch.ArgumentType.STRING,
                            menu: 'SETTING_MENU'
                        }
                    }
                },
                {
                    opcode: 'setprogress',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '设置进度 [progress]',
                    arguments: {
                        progress: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 0,
                        },
                    }
                },
                {
                    opcode: 'getVolumeSetting', // 新增用于获取音量
                    blockType: Scratch.BlockType.REPORTER,
                    text: '获取 [NOTETYPE] 的音量',
                    arguments: {
                        NOTETYPE: {
                            type: Scratch.ArgumentType.STRING,
                            menu: 'NOTETYPE_MENU'
                        }
                    }
                }
            ],
            menus: {
                SETTING_MENU: {
                    acceptReporters: true,
                    items: [
                        '分辨率',
                        '帧率',
                        '码率',
                        '谱面流速',
                        'Note大小',
                        '打击特效大小',
                        '背景亮度',
                        '渲染状态',
                        '谱面文件'
                    ]
                },
                BOOLEAN_SETTINGS: {
                    acceptReporters: true,
                    items: ['打击特效', '打击音效']
                },
                NOTETYPE_MENU: { // 新增菜单用于选择音符类型
                    acceptReporters: true,
                    items: [
                        { text: 'Tap', value: 'tap' },
                        { text: 'SmallSlide', value: 'smallSlide' },
                        { text: 'BigSlide', value: 'bigSlide' },
                        { text: 'Flick', value: 'flick' },
                        { text: 'Rotate', value: 'rotate' },
                        { text: 'Catch', value: 'catch' }
                    ]
                }
            }
        };
    }

    getSetting(args) {
        switch (args.SETTING) {
            case '分辨率':
                return rendererSettings.resolution;
            case '帧率':
                return rendererSettings.framerate;
            case '码率':
                return rendererSettings.bitrate;
            case '谱面流速':
                return rendererSettings.speed;
            case 'Note大小':
                return rendererSettings.size;
            case '打击特效大小':
                return rendererSettings.hitEffectSize;
            case '背景亮度':
                return rendererSettings.bgBrightness;
            case '渲染状态':
                if (typeof isStartRenderer !== 'undefined') {
                    return isStartRenderer;
                } else {
                    return 0;
                }
            case '谱面文件':
                if (typeof zipfile !== 'undefined') {
                    return zipfile;
                } else {
                    return '';
                }
            default:
                return '未知设置';
        }
    }

    setprogress(args) {
        Renderprogress = args.progress;
    }

    /**
     * 辅助函数：安全地从 JSON 字符串中获取音量值
     * @param {string} noteType 音符类型键 (tap, bigSlide, etc.)
     * @returns {number} 音量值 (0-100)
     */
    _getVolume(noteType) {
        try {
            const volumeObject = JSON.parse(rendererSettings.hitsoundVolume);
            // 将字符串值转换为浮点数，并提供默认值 80
            return parseFloat(volumeObject[noteType]) || 80;
        } catch (e) {
            console.error("Error parsing hitsoundVolume JSON:", e);
            return 80; // 解析失败返回默认值
        }
    }

    getVolumeSetting(args) { // 新增方法
        // args.NOTETYPE 将是 'tap', 'smallSlide', 等
        return this._getVolume(args.NOTETYPE);
    }
}

Scratch.extensions.register(new RotaRendererSettings());
