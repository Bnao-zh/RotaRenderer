// 全局状态
let currentStep = 1;
let isPreviewVisible = false;
let settingsInterval; // 用于定时同步设置的定时器
let fileSelected = false; // 步骤1文件是否已选择

// DOM 元素
const iframe = document.getElementById('embedded-frame');
const iframeContainer = document.getElementById('iframe-container');
const statusText = document.getElementById('status-text');
const progressBar = document.getElementById('progress-bar');
const renderStatusText = document.getElementById('render-status-text');
const previewToggleBtn = document.getElementById('preview-toggle-btn');

// --- 引导流程控制函数 ---

/**
 * 渲染当前步骤的界面
 * @param {number} step 要跳转的步骤编号 (1-4)
 */
function renderStep(step) {
    currentStep = step;

    // 1. 更新步骤指示器
    if (step > 0) {
        document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
        document.getElementById(`step-${step}`).classList.add('active');
    }

    // 2. 更新步骤内容
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-content-${step}`).classList.add('active');

    // 3. 步骤特定的逻辑
    if (step === 2) {
        // 进入参数调整页面，确保设置已应用并开始同步
        applySettings();
        startSettingsSync();
        statusText.textContent = '请调整渲染参数';
    } else if (step === 3) {
        // 进入开始渲染页面
        clearInterval(settingsInterval); // 停止定时同步
        // 确保预览区域是隐藏的（或根据上次状态）
        iframeContainer.classList.add('hidden');
        previewToggleBtn.textContent = '显示预览';
        isPreviewVisible = false;
        startRender(); // 调用渲染启动方法
        statusText.textContent = '正在进行渲染...';
        // 模拟渲染进度
        simulateRenderProgress();
    } else if (step === 1) {
        // 重新回到第一步时，清理定时器
        clearInterval(settingsInterval);
        document.getElementById('next-1').disabled = !fileSelected;
        statusText.textContent = '请选择谱面文件';
    } else if (step === 4) {
        // 渲染完成
        clearInterval(settingsInterval);
        statusText.textContent = '渲染任务已完成！';
    }
}

/**
 * 切换到下一步
 */
function nextStep() {
    if (currentStep < 4) {
        renderStep(currentStep + 1);
    }
}

/**
 * 切换到上一步
 */
function prevStep() {
    if (currentStep > 1) {
        if (currentStep === 3) {
            showCancelModal(); // 在第三步返回需要确认
        } else {
            renderStep(currentStep - 1);
        }
    }
}

// --- 步骤 1: 文件选择处理 ---

function handleFileSelect(success) {
    fileSelected = success;
    document.getElementById('next-1').disabled = !fileSelected;
    if (fileSelected) {
        statusText.textContent = '谱面已选择，请点击下一步';
        renderStep(2);
    }
}

function handleZipUpload() {
    // 1. 动态创建一个隐藏的文件输入元素
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    // 设置只接受 .zip 文件
    fileInput.accept = '.zip';
    // 确保它不会出现在页面上，但可以被程序点击
    fileInput.style.display = 'none';

    // 辅助函数：检查文件名是否匹配任何一个给定扩展名
    const matchesExtension = (filename, extensions) => {
        const lowerFilename = filename.toLowerCase();
        return extensions.some(ext => lowerFilename.endsWith(`.${ext}`));
    };

    // 4. 监听文件选择变化事件
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];

        // 5. 检查是否选择了文件
        if (file) {
            renderStep(0);
            // 确保 iframe 存在并且内容已加载，可以访问其 contentWindow
            if (iframe && iframe.contentWindow) {
                const reader = new FileReader();

                // 6. 使用 FileReader 将文件读取为 ArrayBuffer，以便 jszip 处理
                reader.onload = async function (e) {
                    const arrayBuffer = e.target.result;

                    // 检查文件内容逻辑
                    try {
                        // 1. 加载 ZIP 文件
                        const zip = await JSZip.loadAsync(arrayBuffer);
                        let hasTxt = false;
                        let hasImage = false;
                        let hasAudio = false;

                        // 定义允许的文件扩展名
                        const imgExts = ['jpg', 'jpeg', 'png', 'webp'];
                        const audioExts = ['mp3', 'ogg', 'wav', 'flac'];

                        // 2. 遍历 ZIP 文件内容
                        zip.forEach((relativePath, zipEntry) => {
                            // 忽略目录
                            if (zipEntry.dir) return;

                            // 检查文件类型
                            if (matchesExtension(relativePath, ['txt'])) {
                                hasTxt = true;
                            } else if (matchesExtension(relativePath, imgExts)) {
                                hasImage = true;
                            } else if (matchesExtension(relativePath, audioExts)) {
                                hasAudio = true;
                            }
                        });

                        // 3. 检查是否包含所有必需文件
                        if (hasTxt && hasImage && hasAudio) {
                            console.log("ZIP 文件包含所需的所有文件类型 (txt, image, audio)。");

                            // 读取文件为 Data URL (需要重新读取，因为 jszip 需要 ArrayBuffer)
                            // 重新使用 FileReader 读取为 Data URL
                            const dataUrlReader = new FileReader();
                            dataUrlReader.onload = function (dataUrlEvent) {
                                const dataUrl = dataUrlEvent.target.result;

                                // 7. 将 Data URL 字符串保存在 iframe 里的 zipfile 变量
                                iframe.contentWindow.zipfile = dataUrl;

                                // 8. 调用 handleFileSelect(true)
                                handleFileSelect(true);

                                // 清理：移除创建的 fileInput 元素
                                fileInput.remove();
                            };
                            dataUrlReader.onerror = function () {
                                console.error("Data URL 读取失败。");
                                fileInput.remove();
                            };
                            dataUrlReader.readAsDataURL(file); // 再次读取文件

                        } else {
                            // 文件不完整
                            console.error("ZIP 文件缺少必需的文件。需要一个 .txt, 一个图片 (jpg/png/webp), 一个音乐 (mp3/ogg/wav/flac)。");
                            alert("导入失败：ZIP 文件不包含必需的文件（txt、图片、音乐）。");
                            // 清理
                            fileInput.remove();
                            renderStep(1);
                        }

                    } catch (error) {
                        console.error("处理 ZIP 文件时出错:", error);
                        alert("导入失败：无法读取或处理 ZIP 文件。");
                        // 清理
                        fileInput.remove();
                        renderStep(1);
                    }
                };

                reader.onerror = function () {
                    console.error("文件读取失败。");
                    fileInput.remove();
                    renderStep(1);
                };

                // 开始读取文件为 ArrayBuffer
                reader.readAsArrayBuffer(file);
            } else {
                console.error("无法找到 iframe 或 contentWindow。");
                // 清理
                fileInput.remove();
                renderStep(1);
            }
        } else {
            // 9. 如果没有选择文件（用户取消），不运行 handleFileSelect(true)
            console.log("用户取消了文件选择。");
            // 清理
            fileInput.remove();
        }
    });

    // 将 input 元素添加到 DOM 中（尽管是隐藏的）
    document.body.appendChild(fileInput);

    // 3. 模拟用户点击文件输入框
    fileInput.click();
}

let nextRequestId = 0;
const pendingRequests = new Map();

/**
 * 监听 postMessage 回复，处理 IPC 响应
 */
window.addEventListener('message', (event) => {
    const { type, requestId, success, result, error } = event.data;

    if (type === 'ipc-invoke-response' && pendingRequests.has(requestId)) {
        const { resolve, reject } = pendingRequests.get(requestId);
        pendingRequests.delete(requestId);

        if (success) {
            resolve(result);
        } else {
            reject(new Error(error || 'IPC invocation failed with unknown error.'));
        }
    }
});

/**
 * 异步调用主进程 IPC 
 * @param {string} channel IPC 频道名称
 * @param {...any} args 传递给主进程的参数
 * @returns {Promise<any>} 主进程返回的结果
 */
function invokeIpc(channel, ...args) {
    const requestId = nextRequestId++;

    return new Promise((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject });

        // 使用 postMessage 发送请求给 preload 脚本
        window.postMessage({
            type: 'ipc-invoke',
            channel: channel,
            args: args,
            requestId: requestId
        }, '*');

        // 可选：设置超时以防止请求无限期挂起
        setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId);
                reject(new Error(`IPC request timeout for channel: ${channel}`));
            }
        }, 30000); // 30秒超时
    });
}


// =======================================================
// 2. 核心业务逻辑 (使用新的 invokeIpc 替换 ipcRenderer.invoke)
// =======================================================

/**
 * 辅助函数：检查文件名是否匹配任何一个给定扩展名
 * @param {string} filename 文件名
 * @param {string[]} extensions 允许的扩展名数组（不含点）
 * @returns {boolean}
 */
const matchesExtension = (filename, extensions) => {
    const lowerFilename = filename.toLowerCase();
    return extensions.some(ext => lowerFilename.endsWith(`.${ext}`));
};

/**
 * 处理文件夹选择和文件打包上传的逻辑。
 * 需要确保 JSZip 已全局可用。
 */
async function handleFolderSelect() {
    console.log("调用主进程选择文件夹...");

    try {
        // 1. 调用主进程打开文件夹选择对话框
        const folderPath = await invokeIpc('open-directory-dialog');

        if (!folderPath) {
            console.log("用户取消了文件夹选择。");
            return;
        }
        renderStep(0);

        console.log("已选择文件夹:", folderPath);

        // 2. 调用主进程检查文件夹内容并读取文件数据
        const result = await invokeIpc('check-folder-and-get-files', folderPath);

        if (!result.success) {
            alert(`导入失败：${result.message}`);
            renderStep(1);
            return;
        }

        console.log("主进程检查通过，准备打包 ZIP...");
        const fileData = result.fileData; // 包含 { path, data } 的数组

        // 3. 在前端使用 JSZip 打包
        // 假设 JSZip 是一个全局变量
        const zip = new JSZip();

        // 3.1 定义允许的文件扩展名
        const txtExts = ['txt'];
        const imgExts = ['jpg', 'jpeg', 'png', 'webp'];
        const audioExts = ['mp3', 'ogg', 'wav', 'flac'];

        fileData.forEach(item => {
            // 注意：item.data 在 Electron IPC 中传输后，可能是 Buffer 或 Uint8Array
            // JSZip 可以处理 Uint8Array，这通常是传输 Buffer 后的结果
            const filename = item.path.split(/[/\\]/).pop(); // 获取文件名
            let zipFilename = filename;

            // 可选：为了保证在 zip 中有唯一的且容易识别的名字，可以根据类型重命名
            if (matchesExtension(filename, txtExts)) {
                zipFilename = `chart.txt`;
            } else if (matchesExtension(filename, imgExts)) {
                zipFilename = `cover.jpg`;
            } else if (matchesExtension(filename, audioExts)) {
                zipFilename = `song.wav`;
            }

            // 将文件数据添加到 ZIP 中
            zip.file(zipFilename, item.data, { binary: true });
            console.log(`已添加文件到 ZIP: ${zipFilename}`);
        });

        // 4. 生成 Data URL 字符串
        const dataUrl = await zip.generateAsync({ type: "base64" });
        const zipDataUrl = `data:application/zip;base64,${dataUrl}`;

        // 5. 保存 Data URL 并调用 handleFileSelect
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.zipfile = zipDataUrl;
            handleFileSelect(true);
            console.log("ZIP Data URL 已保存并调用 handleFileSelect(true)。");
        } else {
            renderStep(1);
            console.error("无法找到 iframe 或 contentWindow。");
        }

    } catch (error) {
        renderStep(1);
        console.error("处理文件夹时发生错误:", error);
        alert("导入失败：处理文件夹时发生错误。请查看控制台。");
    }
}

// --- 步骤 3: 渲染控制和预览 ---

/**
 * 渲染启动方法 (需要你自己实现)
 */
function startRender() {
    iframe.contentWindow.isStartRenderer = 1;
    console.log('🚀 开始渲染...');
    renderStatusText.textContent = '正在执行渲染任务...';
    // TODO: 在这里写入你的渲染启动逻辑
    // 渲染开始后，你需要定期更新进度条（例如通过 updateProgress(percentage)）
}

/**
 * 渲染取消方法 (需要你自己实现)
 */
function stopRender() {
    iframe.contentWindow.isStartRenderer = 0;
    resetToStep1()
    console.log('🛑 渲染已取消');
}

/**
 * 渲染完成方法 (由你调用)
 */
function doneRender() {
    console.log('✅ 渲染完成');
    // 停止进度模拟
    clearInterval(progressInterval);
    progressBar.style.width = '100%';
    renderStatusText.textContent = '渲染完成，准备进入下一步...';
    // 延时进入完成步骤
    setTimeout(() => {
        renderStep(4);
        openRenderFolder()
    }, 500);
}

/**
 * 切换预览区域的显示/隐藏
 */
function togglePreview() {
    isPreviewVisible = !isPreviewVisible;
    iframeContainer.classList.toggle('hidden', !isPreviewVisible);
    previewToggleBtn.textContent = isPreviewVisible ? '隐藏预览' : '显示预览';
}

// 模拟渲染进度 (仅用于演示)
let progressInterval;
function simulateRenderProgress() {
    let progress = 0;
    progressBar.style.width = '0%';
    progressInterval = setInterval(() => {
        progress = iframe.contentWindow.Renderprogress;
        progressBar.style.width = `${progress}%`;
        if (progress >= 100) {
            clearInterval(progressInterval);
            doneRender();
        }
    }, 100);
    // 确保在 startRender() 中调用此函数
}

// --- 步骤 4: 完成操作 ---

function resetToStep1() {
    fileSelected = false;
    renderStep(1);
    resetIframe(); // 重置iframe状态
    statusText.textContent = '已重置，请重新选择谱面';
}

function openRenderFolder() {
    window.electron.ipcRenderer.invoke('opentempfolder');
    console.log('📁 触发打开渲染文件夹');
    // TODO: 在这里写入你的打开文件夹的系统调用逻辑
}


// --- 弹窗控制函数 ---

function showCancelModal() {
    document.getElementById('cancel-modal').style.display = 'flex';
}

function hideCancelModal() {
    document.getElementById('cancel-modal').style.display = 'none';
}

function confirmCancelRender() {
    hideCancelModal();
    stopRender();
}

// --- 通用/原有逻辑整合 ---

/**
 * 应用设置并发送到 iframe
 */
function applySettings() {
    const hitsoundVolumeObject = {
        tap: document.getElementById('volume-tap').value,
        smallSlide: document.getElementById('volume-smallslide').value,
        bigSlide: document.getElementById('volume-bigslide').value,
        flick: document.getElementById('volume-flick').value,
        rotate: document.getElementById('volume-rotate').value,
        catch: document.getElementById('volume-catch').value,
    };

    // 2. 将 hitsoundVolume 对象转换为 JSON 字符串
    const hitsoundVolumeJsonString = JSON.stringify(hitsoundVolumeObject);
    const settings = {
        type: 'applySettings',
        resolution: document.getElementById('resolution').value,
        framerate: document.getElementById('framerate').value,
        bitrate: document.getElementById('bitrate').value,
        speed: document.getElementById('speed').value,
        size: document.getElementById('size').value,
        // hit: document.getElementById('hit').checked,
        // hitsound: document.getElementById('hitsound').checked
        // --- 新增/修改的设置 ---
        hitEffectSize: document.getElementById('hit-effect-size').value, // 打击特效大小 (0-50)
        bgBrightness: document.getElementById('bg-brightness').value, // 背景亮度 (0-100)
        hitsoundVolume: hitsoundVolumeJsonString,
    };

    // 发送消息到iframe
    if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(settings, '*');
    }


    // 应用分辨率设置
    setIframeResolution(settings.resolution);

    // 更新状态（仅在非渲染步骤）
    if (currentStep !== 3) {
        statusText.textContent = '参数已更新';
        setTimeout(() => {
            if (currentStep !== 3) statusText.textContent = '渲染器就绪';
        }, 1000);
    }
}

/**
 * 设置 iframe 分辨率并缩放
 */
function setIframeResolution(resolution) {
    const [w, h] = resolution.split('x').map(Number);
    const dpr = window.devicePixelRatio || 1;

    let width = w / dpr;
    let height = h / dpr;

    // 保持 iframe 的实际宽高是目标分辨率的 (1/dpr)
    iframe.style.width = `${width}px`;
    iframe.style.height = `${height}px`;

    // 计算缩放比例，以适应 800x500 的容器 (iframe-container)
    // 容器最大宽度 800px，高度 500px
    const maxContainerWidth = 800;
    const maxContainerHeight = 500;

    const scaleX = maxContainerWidth / width;
    const scaleY = maxContainerHeight / height;
    // 使用较小的比例确保内容完整显示
    const finalScale = Math.min(scaleX, scaleY);

    // 仅通过 transform 缩放，不改变 iframe 自身的 width/height 属性
    iframe.style.transform = `scale(${finalScale})`;
    iframe.style.marginBottom = `${(maxContainerHeight - height * finalScale)}px`; // 调整底部间距以居中
}


/**
 * 定时发送设置到 iframe
 */
function startSettingsSync() {
    if (settingsInterval) {
        clearInterval(settingsInterval);
    }

    // 每0.5秒发送一次设置
    settingsInterval = setInterval(applySettings, 500);
}

/**
 * 重置 iframe 源
 */
function resetIframe() {
    iframe.src = iframe.src;
}

// --- 事件监听器设置 ---
function setupEventListeners() {
    // --- 范围输入框的实时值显示 ---
    const rangeControls = [
        { id: 'speed', displayId: 'speed-value' },
        { id: 'size', displayId: 'size-value' },
        { id: 'bg-brightness', displayId: 'bg-brightness-value' },
        { id: 'hit-effect-size', displayId: 'hit-effect-size-value' },
        { id: 'volume-tap', displayId: 'volume-tap-value' },
        { id: 'volume-smallslide', displayId: 'volume-smallslide-value' },
        { id: 'volume-bigslide', displayId: 'volume-bigslide-value' },
        { id: 'volume-flick', displayId: 'volume-flick-value' },
        { id: 'volume-rotate', displayId: 'volume-rotate-value' },
        { id: 'volume-catch', displayId: 'volume-catch-value' },
    ];

    rangeControls.forEach(control => {
        const input = document.getElementById(control.id);
        const display = document.getElementById(control.displayId);
        if (input && display) {
            input.addEventListener('input', function () {
                display.textContent = this.value;
            });
        }
    });

    // 所有设置控件的变更事件
    document.querySelectorAll('#step-content-2 input, #step-content-2 select').forEach(control => {
        // range 和 number 控件使用 'input' (实时更新)，select 使用 'change'
        const eventType = (control.type === 'range' || control.type === 'number' || control.type === 'checkbox') ? 'input' : 'change';
        control.addEventListener(eventType, applySettings);
    });

    // 监听 iframe 加载完成
    iframe.addEventListener('load', function () {
        statusText.textContent = currentStep === 1 ? '请选择谱面文件' : '渲染器已就绪';
        if (currentStep === 2) {
            startSettingsSync();
        }
    });
}

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    // 初始渲染第一步
    renderStep(1);
    // 初始设置 iframe 分辨率
    setIframeResolution(document.getElementById('resolution').value);
    // 禁用下一步按钮直到文件被选择
    document.getElementById('next-1').disabled = true;
});

// 页面卸载时清理定时器
window.addEventListener('beforeunload', function () {
    if (settingsInterval) {
        clearInterval(settingsInterval);
    }
});

// 将需要的函数暴露给全局作用域，供 HTML 中的 onClick 调用
window.resetIframe = resetIframe;
window.startRender = startRender;
window.stopRender = stopRender;
window.doneRender = doneRender;
window.prevStep = prevStep;
window.nextStep = nextStep;
window.showCancelModal = showCancelModal;
window.hideCancelModal = hideCancelModal;
window.confirmCancelRender = confirmCancelRender;
window.togglePreview = togglePreview;
window.handleZipUpload = handleZipUpload;
window.handleFolderSelect = handleFolderSelect;
window.resetToStep1 = resetToStep1;
window.openRenderFolder = openRenderFolder;