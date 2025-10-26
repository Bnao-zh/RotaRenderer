const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel, ...args) => {
      const sanitizedArgs = args.map(arg => {
        if (typeof arg === 'string' && arg.length > 100) {
          return `${arg.slice(0, 100)}...(${arg.length}字符)`;
        }
        return arg;
      });
      console.log('🔄 真实IPC载荷:', { channel, args: sanitizedArgs });
      return ipcRenderer.invoke(channel, ...args);
    }
  }
});