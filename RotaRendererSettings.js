// 初始化变量存储设置
let rendererSettings = {
    type: 'applySettings',
    resolution: '1920x1200',
    framerate: 60,
    bitrate: 8000,
    speed: 20,
    size: 20,
    hit: true,
    hitsound: true
};

// 监听来自父页面的消息
// 嵌入页面 renderer.html
window.addEventListener('message', (event) => {
  // 检查数据是否是对象
  if (typeof event.data === 'object' && event.data !== null && event.data.type === 'applySettings') {
    const newSettings = {
      ...event.data,
      // 使用更安全的转换方式，并提供默认值
      framerate: parseInt(event.data.framerate, 10) || 60, // 如果转换失败，就用默认的60
      bitrate: parseInt(event.data.bitrate, 10) || 8000,
      speed: parseInt(event.data.speed) || 20,
      size: parseInt(event.data.size) || 20,
      hit: Boolean(event.data.hit),
      hitsound: Boolean(event.data.hitsound)
    };
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
                    opcode: 'isSettingEnabled',
                    blockType: Scratch.BlockType.BOOLEAN,
                    text: '[SETTING] 是否开启？',
                    arguments: {
                        SETTING: {
                            type: Scratch.ArgumentType.STRING,
                            menu: 'BOOLEAN_SETTINGS'
                        }
                    }
                }
            ],
            menus: {
                SETTING_MENU: {
                    acceptReporters: true,
                    items: ['分辨率', '帧率', '码率', '谱面流速', 'Note大小']
                },
                BOOLEAN_SETTINGS: {
                    acceptReporters: true,
                    items: ['打击特效', '打击音效']
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
            default:
                return '未知设置';
        }
    }

    isSettingEnabled(args) {
        switch (args.SETTING) {
            case '打击特效':
                return rendererSettings.hit;
            case '打击音效':
                return rendererSettings.hitsound;
            default:
                return false;
        }
    }
}

Scratch.extensions.register(new RotaRendererSettings());
