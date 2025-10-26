window.electron = {
    ipcRenderer: {
        invoke: (channel, ...args) => {
            return new Promise((resolve, reject) => {
                // 生成一个唯一 ID，用于匹配请求和响应
                const requestId = Math.random().toString(36).substring(7);

                // 设置一个一次性监听器来接收父窗口的响应
                const responseHandler = (event) => {
                    if (event.data.type === 'ipc-invoke-response' && event.data.requestId === requestId) {
                        window.removeEventListener('message', responseHandler);
                        if (event.data.success) {
                            resolve(event.data.result);
                        } else {
                            reject(new Error(event.data.error));
                        }
                    }
                };
                window.addEventListener('message', responseHandler);

                // 向父窗口发送请求
                window.parent.postMessage({
                    type: 'ipc-invoke',
                    channel,
                    args,
                    requestId
                }, '*');
            });
        }
    }
};
class SCRenderer {
    getInfo() {
        return {
            id: 'screnderer',
            name: 'SC Renderer',
            blocks: [
                {
                    opcode: 'initren',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '初始化渲染环境'
                },
                {
                    opcode: 'savefile',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '保存文件 [base64] 到 [name]',
                    arguments: {
                        base64: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: 'data:image/png;base64,'
                        },
                        name: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: 'f0.png'
                        }
                    }
                },
                {
                    opcode: 'mixhit',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '合成打击音 [hitlist]',
                    arguments: {
                        hitlist: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: '0,a1.wav'
                        }
                    }
                },
                {
                    opcode: 'startren',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '开始渲染视频 帧率:[framerate] 码率:[bitrate]',
                    arguments: {
                        framerate: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 60
                        },
                        bitrate: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: '5000k'
                        }
                    }
                },
                {
                    opcode: 'delimg',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '删除临时图片'
                },
            ]
        };
    }
    // 初始化渲染环境
    async initren() {
        try {
            await window.electron.ipcRenderer.invoke('initren');
            console.log('渲染环境初始化成功');
        } catch (error) {
            console.error('初始化渲染环境失败:', error);
        }
    }

    // 保存图片到temp文件夹
    async savefile(args) {
        try {
            await window.electron.ipcRenderer.invoke('savefile', args.base64, args.name);
            console.log(`图片保存成功`);
        } catch (error) {
            console.error('保存图片失败:', error);
        }
    }

    async mixhit(args) {
        try {
            const outputPath = await window.electron.ipcRenderer.invoke('mixhit', args.hitlist);
            console.log(`打击音合成成功:`, outputPath);
        } catch (error) {
            console.error('合成打击音失败:', error);
        }
    }

    // 开始渲染MP4
    async startren(args) {
        try {
            const outputPath = await window.electron.ipcRenderer.invoke('startren', args.framerate, args.bitrate);
            console.log('MP4 渲染成功，输出路径:', outputPath);
        } catch (error) {
            console.error('渲染MP4失败:', error);
        }
    }

    // 删除临时图片（保留output.mp4）
    async delimg() {
        try {
            await window.electron.ipcRenderer.invoke('delimg');
            console.log('临时图片清理成功');
        } catch (error) {
            console.error('清理临时图片失败:', error);
        }
    }

    async startRendering(args) {
        try {
            const outputPath = await window.electron.ipcRenderer.invoke('startRendering', args.w, args.h);
            console.log('MP4 渲染成功，输出路径:', outputPath);
            return outputPath;
        } catch (error) {
            console.error('渲染MP4失败:', error);
            return '';
        }
    }

}

Scratch.extensions.register(new SCRenderer());