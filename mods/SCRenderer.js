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
    // 构造函数用于保存渲染配置，例如分辨率
    constructor() {
        this.renderConfig = {
            width: 640,  // 默认值
            height: 480, // 默认值
            outputPath: 'output.mp4' // 默认值
        };
    }

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
                    text: '合成打击音 [hitlist] [vollist]',
                    arguments: {
                        hitlist: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: '0,null.wav'
                        },
                        vollist: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: '80,80,80,80,80,80'
                        }
                    }
                },
                {
                    opcode: 'startren',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '(旧)使用已保存帧渲染视频 帧率:[framerate] 码率:[bitrate]',
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
                '---'
                ,
                // --- 新增视频渲染功能积木 ---
                {
                    opcode: 'setRenderResolution',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '设置视频分辨率 宽:[WIDTH] 高:[HEIGHT] 输出到:[OUTPUTPATH]',
                    arguments: {
                        WIDTH: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 1680
                        },
                        HEIGHT: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 1050
                        },
                        OUTPUTPATH: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: 'output.mp4'
                        }
                    }
                },
                {
                    opcode: 'startVideoRender',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '开始视频渲染 帧率:[FRAMERATE] 码率:[BITRATE]',
                    arguments: {
                        FRAMERATE: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 60
                        },
                        BITRATE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: '8000k'
                        }
                    }
                },
                {
                    opcode: 'addFrameToVideo',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '添加视频帧 [DATAURL]',
                    arguments: {
                        DATAURL: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: 'data:image/png;base64,...'
                        }
                    }
                },
                {
                    opcode: 'endVideoRender',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '结束视频渲染'
                }
                // --- 新增视频渲染功能积木结束 ---
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
            const outputPath = await window.electron.ipcRenderer.invoke('mixhit', args.hitlist, args.vollist);
            console.log(`打击音合成成功:`, outputPath);
        } catch (error) {
            console.error('合成打击音失败:', error);
        }
    }

    // 开始渲染MP4 (旧)
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
    
    // --- 新增的视频渲染方法 ---
    isElectronAvailable() {
        return (
            typeof window.electron !== 'undefined' &&
            typeof window.electron.ipcRenderer !== 'undefined' &&
            typeof window.electron.ipcRenderer.invoke === 'function'
        );
    }
    
    /**
     * 设置视频分辨率和输出路径（本地保存配置）
     * @param {object} args
     */
    setRenderResolution(args) {
        this.renderConfig.width = Scratch.Cast.toNumber(args.WIDTH);
        this.renderConfig.height = Scratch.Cast.toNumber(args.HEIGHT);
        this.renderConfig.outputPath = Scratch.Cast.toString(args.OUTPUTPATH);
        console.log(`视频渲染配置已更新: ${this.renderConfig.width}x${this.renderConfig.height}, 输出: ${this.renderConfig.outputPath}`);
    }

    /**
     * 开始渲染视频 (对应主进程的 'startRendering')
     * @param {object} args
     */
    async startVideoRender(args) {
        if (!this.isElectronAvailable()) {
            console.warn('非 Electron 环境，跳过视频渲染启动。');
            return; // 立即返回，不执行 IPC
        }
        const framerate = Scratch.Cast.toNumber(args.FRAMERATE);
        const bitrate = Scratch.Cast.toString(args.BITRATE);

        try {
            const success = await window.electron.ipcRenderer.invoke('startRendering', {
                width: this.renderConfig.width,
                height: this.renderConfig.height,
                frameRate: framerate,
                bitrate: bitrate,
                outputPath: this.renderConfig.outputPath
            });

            if (success) {
                console.log(`视频渲染已启动: ${this.renderConfig.width}x${this.renderConfig.height} @ ${framerate}fps, ${bitrate}`);
            } else {
                 throw new Error('主进程拒绝启动渲染或启动失败');
            }
        } catch (error) {
            console.error('启动视频渲染失败:', error);
        }
    }

    /**
     * 传入一帧图片数据 (对应主进程的 'addFrame')
     * @param {object} args
     */
    async addFrameToVideo(args) {
        if (!this.isElectronAvailable()) {
            // 非 Electron 环境，跳过
            return; 
        }
        const dataUrl = Scratch.Cast.toString(args.DATAURL);
        if (!dataUrl) return;

        // 注意：addFrame 理论上应该是非阻塞的 (不需要 await)，因为它会在主进程中被写入管道。
        // 但由于我们使用 Promise-based invoke 模拟，这里为了防止过高的 IPC 调用速率，
        // 最好让它快速返回，或者在主进程的 addFrame 中不返回 Promise。
        // 这里仍使用 await 只是为了遵循 invoke 模式，但在实际 Scratch 运行中，它会很快返回。
        try {
            await window.electron.ipcRenderer.invoke('addFrame', dataUrl);
            // console.log('一帧已发送'); // 频繁打印会影响性能
        } catch (error) {
            console.error('发送视频帧失败:', error);
        }
    }

    /**
     * 结束渲染 (对应主进程的 'endRendering')
     */
    async endVideoRender() {
        if (!this.isElectronAvailable()) {
            console.warn('非 Electron 环境，跳过结束视频渲染。');
            return null; // 立即返回，不执行 IPC
        }
        try {
            const outputPath = await window.electron.ipcRenderer.invoke('endRendering');
            if (outputPath) {
                console.log('🎉 视频渲染完成，文件位于:', outputPath);
            } else {
                console.warn('视频渲染结束，但未返回有效的输出路径。');
            }
            return outputPath;
        } catch (error) {
            console.error('结束视频渲染失败:', error);
        }
    }
    // --- 新增的视频渲染方法结束 ---

}

Scratch.extensions.register(new SCRenderer());