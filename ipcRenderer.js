// ** IPC 消息处理 (保持不变) **
// 假设 window.electron.ipcRenderer 存在
window.addEventListener('message', async (event) => {
    const { type, channel, args, requestId } = event.data;

    if (type === 'ipc-invoke') {
        try {
            // 假设你在主进程中实现了这些方法
            if (!window.electron || !window.electron.ipcRenderer || !window.electron.ipcRenderer.invoke) {
                throw new Error('Electron API (preload) 不可用。');
            }

            const result = await window.electron.ipcRenderer.invoke(channel, ...args);

            event.source.postMessage({
                type: 'ipc-invoke-response',
                requestId,
                success: true,
                result
            }, '*');
        } catch (error) {
            event.source.postMessage({
                type: 'ipc-invoke-response',
                requestId,
                success: false,
                error: error.message
            }, '*');
        }
    }
});