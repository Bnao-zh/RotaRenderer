const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const fs = require('fs');
const { Buffer } = require('buffer');
const { spawn } = require('child_process');
const { VideoRenderer } = require('./video_renderer.js');

// if (app.isPackaged) {
//     const logFile = path.join(process.resourcesPath, 'app.log');
//     console.log = (...args) => {
//         fs.appendFileSync(logFile, args.join(' ') + '\n');
//     };
// }


// 动态获取临时目录路径
function getTempDir() {
    if (app.isPackaged) {
        // 打包后：将 temp 目录放在 asar 外部
        const resourcesPath = process.resourcesPath; // 指向 asar 所在目录
        return path.join(resourcesPath, 'temp');
    } else {
        // 打包前：使用项目内的 temp 目录
        return path.join(__dirname, 'temp');
    }
}

// 初始化临时目录
const TEMP_DIR = getTempDir();

// 动态获取 FFmpeg 路径
function getFFmpegPath() {
    let ffmpegPath;
    
    if (app.isPackaged) {
        // 打包后：从 asar 外部加载 FFmpeg
        ffmpegPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'ffmpeg');
    } else {
        // 打包前：从项目 bin 目录加载 FFmpeg
        ffmpegPath = path.join(__dirname, 'bin', 'ffmpeg');
    }
    
    if (fs.existsSync(ffmpegPath)) {
        return ffmpegPath;
    } else {
        return 'ffmpeg';
    }
}

// 初始化 FFmpeg 路径
const FFMPEG_PATH = getFFmpegPath();

const MAIN_AUDIO = path.join(TEMP_DIR, 'audio.mp3');
const OUTPUT_FILE = path.join(TEMP_DIR, 'output.aac');


// 初始化渲染环境
function initren() {
    return new Promise((resolve, reject) => {
        // 确保temp文件夹存在
        if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
        }

        // 清空temp文件夹
        fs.readdir(TEMP_DIR, (err, files) => {
            if (err) return reject(err);

            for (const file of files) {
                const filePath = path.join(TEMP_DIR, file);
                fs.unlinkSync(filePath);
            }

            resolve();
        });
    });
}

/**
 * 通用文件保存函数（兼容Base64、Buffer、Data URL）
 * @param {string|Buffer} data - 文件数据（Base64字符串、Buffer或Data URL）
 * @param {string} name - 文件名（含扩展名，如 "file.mp3"）
 * @param {string} [encoding] - 可选编码（默认自动检测）
 * @returns {Promise<string>} - 返回保存后的文件路径
 */
function savefile(event, data, name) {
    return new Promise((resolve, reject) => {
        console.log('🔍 主进程接收原始数据:', { name: String(name).slice(0, 10) });
        // 1. 清理文件名（移除非法字符和路径）
        const safeName = path.basename(name) // 移除路径
            .replace(/[^a-zA-Z0-9\-_.]/g, '_') // 替换非法字符
            .slice(0, 100); // 限制长度

        if (!safeName) {
            return reject(new Error('Invalid filename'));
        }

        const filePath = path.join(TEMP_DIR, safeName);

        // 2. 数据处理（保持您原有的优秀逻辑）
        let buffer;
        try {
            if (Buffer.isBuffer(data)) {
                buffer = data;
            }
            else if (typeof data === 'string' || data?.toString) {
                const dataStr = String(data);
                const isDataURL = dataStr.startsWith('data:');
                const base64Data = isDataURL
                    ? dataStr.split(',')[1]
                    : dataStr;
                buffer = Buffer.from(base64Data, isDataURL ? 'base64' : encoding || 'utf8');
            }
            else if (data instanceof Uint8Array || Array.isArray(data)) {
                buffer = Buffer.from(data);
            }
            else {
                throw new TypeError(`Unsupported data type: ${typeof data}`);
            }

            // 3. 写入文件
            fs.writeFile(filePath, buffer, (err) => {
                if (err) return reject(err);
                resolve(filePath);
            });
        } catch (e) {
            reject(e);
        }
    });
}

// 新增音量调整函数
function adjustVolume(inputPath, outputPath, volume) {
    return new Promise((resolve, reject) => {
        // Create a temporary output file with .wav extension
        const tempOutputPath = outputPath.replace('.wav', '_adjusted.wav');

        const args = [
            '-i', inputPath,
            '-filter:a', `volume=${volume}`,
            '-c:a', 'pcm_s16le', // Specify audio codec
            '-f', 'wav', // Force WAV format
            '-y',
            tempOutputPath
        ];

        console.log(`调整音量: ${inputPath} -> ${volume * 100}%`);

        const ffmpegProcess = execFile(FFMPEG_PATH, args, { shell: false }, (error) => {
            if (error) {
                console.error(`音量调整失败: ${inputPath}`, error);
                // Clean up temp file if it exists
                if (fs.existsSync(tempOutputPath)) {
                    fs.unlinkSync(tempOutputPath);
                }
                reject(error);
            } else {
                try {
                    // Replace original file with the adjusted version
                    fs.unlinkSync(outputPath);
                    fs.renameSync(tempOutputPath, outputPath);
                    console.log(`音量调整完成: ${inputPath}`);
                    resolve();
                } catch (fsError) {
                    console.error(`文件操作失败: ${inputPath}`, fsError);
                    // Clean up temp file if it exists
                    if (fs.existsSync(tempOutputPath)) {
                        fs.unlinkSync(tempOutputPath);
                    }
                    reject(fsError);
                }
            }
        });

        ffmpegProcess.on('error', (err) => {
            console.error('无法启动FFmpeg进程:', err);
            reject(err);
        });
    });
}

//合成打击音
function mixhit(event, hitlist, vollist) {
    return new Promise((resolve, reject) => {
        try {
            // 1. 参数预处理
            const processed = {
                hitlist: hitlist.split(',').map(item => item.trim()),
                vollist: vollist.split(',').map(item => item.trim())
            };

            // 2. 创建临时目录（如果不存在）
            if (!fs.existsSync(TEMP_DIR)) {
                fs.mkdirSync(TEMP_DIR, { recursive: true });
            }

            // 3. 调整指定音频文件的音量
            const adjustVolumePromises = [];
            const filesToAdjust = {
                'a2.wav': processed.vollist[2] / 100,  // 50% volume
                'a3.wav': processed.vollist[3] / 100,
                'a0.wav': processed.vollist[0] / 100,
                'a1.wav': processed.vollist[1] / 100,
                'a40.wav': processed.vollist[4] / 100,
                'a41.wav': processed.vollist[4] / 100,
                'a5.wav': processed.vollist[5] / 100
            };

            for (const [filename, volume] of Object.entries(filesToAdjust)) {
                const filePath = path.join(TEMP_DIR, filename);
                if (fs.existsSync(filePath)) {
                    adjustVolumePromises.push(
                        adjustVolume(filePath, filePath, volume)
                    );
                }
            }

            // 等待所有音量调整完成
            Promise.all(adjustVolumePromises)
                .then(() => {
                    // 4. 继续原有的混音流程
                    const batchSize = 100;
                    let currentBatch = 0;
                    let intermediateFiles = [];
                    let lastOutput = MAIN_AUDIO;
                    let gpuAccelerationFailed = false;

                    function processNextBatch(gpuAccelerationFailed) {
                        if (currentBatch * batchSize >= processed.hitlist.length) {
                            convertToMp3(lastOutput, OUTPUT_FILE)
                                .then(() => cleanUp())
                                .then(() => {
                                    console.log('混音完成! 输出文件:', OUTPUT_FILE);
                                    resolve(OUTPUT_FILE);
                                })
                                .catch(reject);
                            return;
                        }

                        const batchStart = currentBatch * batchSize;
                        const batchEnd = Math.min((currentBatch + 1) * batchSize, processed.hitlist.length);
                        const batchItems = processed.hitlist.slice(batchStart, batchEnd);

                        const intermediateFile = path.join(TEMP_DIR, `intermediate_${currentBatch}.wav`);
                        intermediateFiles.push(intermediateFile);

                        processBatch(lastOutput, batchItems, intermediateFile, gpuAccelerationFailed)
                            .then(() => {
                                lastOutput = intermediateFile;
                                currentBatch++;
                                processNextBatch();
                            })
                            .catch(reject);
                    }

                    processNextBatch(gpuAccelerationFailed);
                })

        } catch (err) {
            console.error('混音过程中出错:', err);
            reject(err);
        }
    });
}

async function processBatch(mainAudio, hitlist, outputFile, gpuAccelerationFailed) {
    return new Promise(async (resolve, reject) => {
        try {
            let filterComplex = [];
            let amixInputs = ['[0:a]'];
            let inputArgs = ['-i', mainAudio];
            let inputIndex = 1;

            for (let i = 0; i < hitlist.length; i += 2) {
                const audioFile = path.join(TEMP_DIR, hitlist[i + 1]);
                inputArgs.push('-i', audioFile);

                const time = hitlist[i];
                const delayMs = Math.round(time * 1000);

                filterComplex.push(
                    `[${inputIndex}:a]adelay=${delayMs}|${delayMs}[d${i / 2}]`
                );
                amixInputs.push(`[d${i / 2}]`);
                inputIndex++;
            }

            const filterStr = [
                ...filterComplex,
                `${amixInputs.join('')}amix=inputs=${amixInputs.length}:duration=longest:normalize=0`
            ].join(';');

            const baseArgs = [
                ...inputArgs,
                '-filter_complex', filterStr,
                '-c:a', 'pcm_s16le',
                '-y',
                outputFile
            ];

            if (!gpuAccelerationFailed) {
                const gpuArgs = [
                    '-hwaccel', 'auto',
                    ...baseArgs
                ];

                console.log('尝试GPU加速处理...');
                console.log('执行FFmpeg批处理命令:', [FFMPEG_PATH, ...gpuArgs].join(' '));

                try {
                    await executeFfmpeg(FFMPEG_PATH, gpuArgs);
                    console.log('GPU加速处理完成:', outputFile);
                    return resolve();
                } catch (gpuError) {
                    console.warn('GPU加速处理失败:', gpuError.message);
                    gpuAccelerationFailed = true;
                    // Continue to CPU fallback
                }
            }

            // CPU fallback (either first attempt or after GPU failure)
            console.log(gpuAccelerationFailed
                ? '使用普通处理方式 (GPU加速已禁用)'
                : '执行普通FFmpeg处理');

            console.log('执行FFmpeg批处理命令:', [FFMPEG_PATH, ...baseArgs].join(' '));
            await executeFfmpeg(FFMPEG_PATH, baseArgs);
            console.log('处理完成:', outputFile);
            resolve();

        } catch (err) {
            console.error('批处理错误:', err);
            reject(err);
        }
    });
}

// Helper function to execute FFmpeg and handle the process
function executeFfmpeg(ffmpegPath, args) {
    return new Promise((resolve, reject) => {
        const ffmpegProcess = execFile(ffmpegPath, args, { shell: false }, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });

        ffmpegProcess.on('error', (err) => {
            reject(err);
        });

        ffmpegProcess.stderr.on('data', (data) => {
            console.error(data.toString());
        });
    });
}

async function convertToMp3(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
        const args = [
            '-i', inputFile,
            '-c:a', 'aac',
            '-b:a', '192k',
            '-vn',
            '-y',
            outputFile
        ];

        console.log('转换为AAC:', [FFMPEG_PATH, ...args].join(' '));

        const ffmpegProcess = execFile(FFMPEG_PATH, args, { shell: false }, (error) => {
            if (error) {
                console.error('AAC转换失败:', error);
                reject(new Error(`AAC转换失败: ${error.message}`));
            } else {
                console.log('AAC转换完成:', outputFile);
                resolve();
            }
        });

        ffmpegProcess.on('error', (err) => {
            console.error('无法启动FFmpeg进程:', err);
            reject(err);
        });
    });
}

//清理临时文件
function cleanUp() {
    return new Promise((resolve, reject) => {
        fs.readdir(TEMP_DIR, (err, files) => {
            if (err) return reject(err);
            for (const file of files) {
                if (file.includes("intermediate")) {
                    const filePath = path.join(TEMP_DIR, file);
                    fs.unlinkSync(filePath);
                }
            }

            resolve();
        });
    });
}

// 开始渲染MP4
function startren(event, framerate, bitrate) {
    return new Promise((resolve, reject) => {
        try {
            // 1. 参数预处理
            const processed = {
                framerate: parseFloat(framerate),
                bitrate: parseInt(String(bitrate).replace(/k$/i, ''))
            };

            // 2. 参数验证
            if (isNaN(processed.framerate) || processed.framerate <= 0) {
                throw new Error(`无效帧率: ${framerate} (应为正数)`);
            }

            if (isNaN(processed.bitrate) || processed.bitrate <= 0) {
                throw new Error(`无效比特率: ${bitrate} (应为正数或"5000k"格式)`);
            }

            // 3. 构建FFmpeg参数（先尝试GPU加速）
            const buildArgs = (useGPU) => {
                const baseArgs = [
                    '-framerate', processed.framerate.toString(),
                    '-i', `${TEMP_DIR}/f%d.png`,
                    '-i', `${TEMP_DIR}/output.aac`,
                    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                    '-pix_fmt', 'yuv420p',
                    '-b:v', `${processed.bitrate}k`,
                    '-progress', 'pipe:1',
                    '-y',
                    path.join(TEMP_DIR, 'output.mp4')
                ];

                if (useGPU) {
                    return [
                        '-hwaccel', 'auto',
                        ...baseArgs.slice(0, -1), // 排除输出路径
                        '-c:v', 'h264_nvenc',    // NVIDIA GPU编码
                        ...baseArgs.slice(-1)     // 重新添加输出路径
                    ];
                } else {
                    return [
                        ...baseArgs.slice(0, -1),
                        '-c:v', 'libx264',       // CPU编码
                        ...baseArgs.slice(-1)
                    ];
                }
            };

            // 4. 执行FFmpeg（先尝试GPU加速，失败后回退到CPU）
            const executeFFmpeg = (useGPU, retryOnError = true) => {
                const args = buildArgs(useGPU);
                console.log(`执行FFmpeg命令(${useGPU ? 'GPU' : 'CPU'}模式):`, [FFMPEG_PATH, ...args].join(' '));

                // 进度跟踪变量
                let duration = 0;
                let progress = 0;
                let lastEmittedProgress = -1;

                const ffmpegProcess = execFile(FFMPEG_PATH, args, { shell: false }, (error) => {
                    if (error) {
                        if (useGPU && retryOnError) {
                            console.log(error);
                            console.log('GPU加速失败，尝试回退到CPU编码...');
                            return executeFFmpeg(false, false); // 回退到CPU编码
                        }
                        return reject(error);
                    }
                    resolve(path.join(TEMP_DIR, 'output.mp4'));
                });

                // 实时进度处理
                ffmpegProcess.stderr.on('data', (data) => {
                    const str = data.toString();

                    // 提取总时长（仅第一次）
                    if (!duration && str.match(/Duration: (\d+):(\d+):(\d+)/)) {
                        const [, h, m, s] = str.match(/Duration: (\d+):(\d+):(\d+)/);
                        duration = parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s);
                    }

                    // 提取当前进度
                    if (str.match(/time=(\d+):(\d+):(\d+)/)) {
                        const [, h, m, s] = str.match(/time=(\d+):(\d+):(\d+)/);
                        const currentTime = parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s);

                        if (duration) {
                            progress = Math.min(100, (currentTime / duration) * 100);
                            const roundedProgress = Math.floor(progress);

                            // 更新进度
                            if (roundedProgress !== lastEmittedProgress) {
                                lastEmittedProgress = roundedProgress;
                                event.sender.send('render-progress', roundedProgress);
                                console.log(`渲染进度(${useGPU ? 'GPU' : 'CPU'}模式): ${roundedProgress}%`);
                            }
                        }
                    }

                    // 检测GPU相关错误
                    if (useGPU && retryOnError && (
                        str.includes('Driver does not support the required nvenc API version') ||
                        str.includes('No NVIDIA GPU was found') ||
                        str.includes('Cannot load libnvidia-encode.so')
                    )) {
                        console.log('检测到GPU不支持，回退到CPU编码...');
                        ffmpegProcess.kill(); // 终止当前进程
                        executeFFmpeg(false, false); // 回退到CPU编码
                    }
                });

                ffmpegProcess.on('error', (err) => {
                    console.error(`FFmpeg进程错误(${useGPU ? 'GPU' : 'CPU'}模式):`, err);
                    if (useGPU && retryOnError) {
                        console.log('尝试回退到CPU编码...');
                        executeFFmpeg(false, false); // 回退到CPU编码
                    } else {
                        reject(err);
                    }
                });
            };

            // 首先尝试使用GPU加速
            executeFFmpeg(true);
        } catch (err) {
            console.error('参数处理错误:', err);
            reject(err);
        }
    });
}


// 删除图片
function delimg() {
    return new Promise((resolve, reject) => {
        fs.readdir(TEMP_DIR, (err, files) => {
            if (err) return reject(err);

            for (const file of files) {
                if (file !== 'output.mp4' && file !== 'output.aac') {
                    const filePath = path.join(TEMP_DIR, file);
                    fs.unlinkSync(filePath);
                }
            }

            resolve();
        });
    });
}
// // 新方法------------------------------------------
// let ffmpegProcess = null;
// let frameCounter = 0;
// const tempDir = path.join(TEMP_DIR, 'temp_frames');
// let isRendering = false;
// let outputPath = '';

// function startRendering(event, output, fps = 60, width = 1280, height = 720) {
//     return new Promise((resolve, reject) => {
//         if (isRendering) {
//             reject(new Error('渲染已经在进行中'));
//             return;
//         }

//         isRendering = true;
//         frameCounter = 0;
//         outputPath = output;

//         // 创建临时目录存放帧
//         if (!fs.existsSync(tempDir)) {
//             fs.mkdirSync(tempDir);
//         } else {
//             // 清空临时目录
//             fs.readdirSync(tempDir).forEach(file => {
//                 fs.unlinkSync(path.join(tempDir, file));
//             });
//         }

//         // 设置FFmpeg参数
//         const args = [
//             '-y', // 覆盖输出文件
//             '-f', 'image2pipe', // 输入格式为图像管道
//             '-r', fps.toString(), // 输入帧率
//             '-s', `${width}x${height}`, // 帧尺寸
//             '-i', '-', // 从标准输入读取
//             '-c:v', 'libx264', // 视频编码器
//             '-preset', 'fast', // 编码预设
//             '-pix_fmt', 'yuv420p', // 像素格式
//             '-r', fps.toString(), // 输出帧率
//             outputPath
//         ];

//         ffmpegProcess = spawn(FFMPEG_PATH, args);

//         // 处理错误和输出
//         ffmpegProcess.stderr.on('data', (data) => {
//             console.error(`FFmpeg stderr: ${data}`);
//         });

//         ffmpegProcess.on('error', (err) => {
//             isRendering = false;
//             console.error('FFmpeg 进程错误:', err);
//             reject(err);
//         });

//         // 等待FFmpeg准备好
//         setTimeout(() => {
//             resolve();
//         }, 100);
//     });
// }

// /**
//  * 添加一帧到视频
//  * @param {string} pngDataURL - PNG图像的DataURL
//  * @returns {Promise<void>}
//  */
// function addFrame(event, pngDataURL) {
//     return new Promise((resolve, reject) => {
//         if (!isRendering || !ffmpegProcess) {
//             reject(new Error('渲染尚未开始或已结束'));
//             return;
//         }

//         // 从DataURL中提取Base64数据
//         const base64Data = pngDataURL.replace(/^data:image\/png;base64,/, '');
//         const buffer = Buffer.from(base64Data, 'base64');

//         // 将帧数据写入FFmpeg的标准输入
//         ffmpegProcess.stdin.write(buffer, (err) => {
//             if (err) {
//                 console.error('写入帧数据失败:', err);
//                 reject(err);
//             } else {
//                 frameCounter++;
//                 resolve();
//             }
//         });
//     });
// }

// /**
//  * 结束视频渲染
//  * @returns {Promise<string>} 返回输出视频路径
//  */
// function endRendering() {
//     return new Promise((resolve, reject) => {
//         if (!isRendering || !ffmpegProcess) {
//             reject(new Error('渲染尚未开始或已结束'));
//             return;
//         }

//         // 监听FFmpeg进程结束
//         ffmpegProcess.on('close', (code) => {
//             isRendering = false;
//             if (code === 0) {
//                 resolve(outputPath);
//             } else {
//                 reject(new Error(`FFmpeg 进程退出，代码 ${code}`));
//             }
//         });

//         ffmpegProcess.on('error', (err) => {
//             isRendering = false;
//             reject(err);
//         });

//         // 结束输入流
//         ffmpegProcess.stdin.end();
//     });
// }

process.env.FFMPEG_PATH = FFMPEG_PATH;


// --- 渲染状态管理 ---
/** @type {VideoRenderer | null} */
let currentRenderer = null;

// --- IPC 处理器函数 ---

/**
 * 启动视频渲染进程
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {object} options 渲染选项
 * @param {number} options.width 视频宽度
 * @param {number} options.height 视频高度
 * @param {number} options.frameRate 帧率
 * @param {string} options.bitrate 码率 (例如 '2000k')
 * @param {string} options.outputPath 输出文件路径
 * @returns {Promise<boolean>} 启动成功返回 true
 */
async function startRendering(event, { width, height, frameRate, bitrate, outputPath }) {
    if (currentRenderer) {
        console.warn('已有渲染任务在进行中。');
        return false;
    }

    try {
        // 实例化 VideoRenderer，并将 FFMPEG_PATH 传入（如果你的类设计成这样）
        // 假设 VideoRenderer 构造函数中会使用 process.env.FFMPEG_PATH 或直接使用传入的路径
        tempoutputPath = path.join(TEMP_DIR, outputPath);
        currentRenderer = new VideoRenderer(tempoutputPath, FFMPEG_PATH, path.join(TEMP_DIR, 'output.aac'));

        // 启动 FFmpeg 进程
        currentRenderer.startRender(width, height, frameRate, bitrate);

        console.log(`[IPC] 渲染任务已启动，输出到: ${outputPath}`);
        return true;
    } catch (error) {
        console.error('[IPC] 启动渲染失败:', error);
        currentRenderer = null;
        return false;
    }
}


/**
 * 传入一帧图片数据
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} dataUrl 图片的 Data URL 字符串
 * @returns {Promise<boolean>} 传入成功返回 true
 */
async function addFrame(event, dataUrl) {
    if (!currentRenderer) {
        console.error('[IPC] 无法添加帧，渲染任务未启动。');
        return false;
    }

    try {
        currentRenderer.sendFrame(dataUrl);
        // console.log('[IPC] 成功发送一帧。'); // 频繁打印可能影响性能
        return true;
    } catch (error) {
        console.error('[IPC] 发送帧失败:', error);
        return false;
    }
}


/**
 * 结束渲染，关闭管道并等待文件写入完成
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<string|null>} 渲染成功返回输出路径，失败返回 null
 */
async function endRendering(event) {
    if (!currentRenderer) {
        console.warn('[IPC] 渲染任务已结束或未启动。');
        return null;
    }

    const rendererToFinish = currentRenderer;
    currentRenderer = null; // 清除当前引用，允许新任务启动

    try {
        const outputPath = await rendererToFinish.endRender();
        console.log(`[IPC] 渲染任务成功完成: ${outputPath}`);
        return outputPath;
    } catch (error) {
        console.error('[IPC] 结束渲染失败:', error);
        // 确保清理
        return null;
    }
}

function opentempfolder() {
    shell.openPath(TEMP_DIR);
}

// 暴露函数给渲染进程
ipcMain.handle('initren', initren);
ipcMain.handle('savefile', savefile);
ipcMain.handle('mixhit', mixhit);
ipcMain.handle('startren', startren);
ipcMain.handle('delimg', delimg);
ipcMain.handle('startRendering', startRendering);
ipcMain.handle('addFrame', addFrame);
ipcMain.handle('endRendering', endRendering);
ipcMain.handle('opentempfolder', opentempfolder);
// =======================================================
// 选择文件夹相关
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
 * IPC 处理器：打开文件夹选择对话框
 */
ipcMain.handle('open-directory-dialog', async (event) => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null; // 用户取消
    }

    return result.filePaths[0]; // 返回所选文件夹路径
});

/**
 * IPC 处理器：检查文件夹内容，读取所有可能的必需文件（txt、图片、音频）
 * 注意：不验证 txt 内容，不强制图片存在，由前端处理逻辑
 * @param {string} folderPath 文件夹路径
 * @returns {{success: boolean, message?: string, fileData?: Array<{path: string, data: Buffer}>}} 结果对象
 */
ipcMain.handle('check-folder-and-get-files', async (event, folderPath) => {
    const imgExts = ['jpg', 'jpeg', 'png', 'webp'];
    const audioExts = ['mp3', 'ogg', 'wav', 'flac'];
    const txtExts = ['txt'];

    const validFiles = []; // 存储所有合法文件路径（txt、img、audio）

    try {
        const files = await fs.promises.readdir(folderPath);

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const stat = await fs.promises.stat(filePath);

            // 忽略目录
            if (stat.isDirectory()) continue;

            // 收集所有合法文件（txt、图片、音频）
            if (matchesExtension(file, txtExts) ||
                matchesExtension(file, imgExts) ||
                matchesExtension(file, audioExts)) {
                validFiles.push(filePath);
            }
        }

        // 检查是否存在至少一个 txt 和一个音频（图片可选）
        const hasTxt = validFiles.some(f => matchesExtension(path.basename(f), txtExts));
        const hasAudio = validFiles.some(f => matchesExtension(path.basename(f), audioExts));

        if (!hasTxt) {
            return {
                success: false,
                message: "文件夹中缺少 .txt 文件。"
            };
        }
        if (!hasAudio) {
            return {
                success: false,
                message: "文件夹中缺少音频文件（支持 mp3/ogg/wav/flac）。"
            };
        }

        // 读取所有合法文件的内容（Buffer）
        const fileDataPromises = validFiles.map(async (filePath) => {
            const data = await fs.promises.readFile(filePath);
            return { path: filePath, data }; // data 是 Buffer
        });

        const fileData = await Promise.all(fileDataPromises);

        return {
            success: true,
            message: "文件检查通过。",
            fileData: fileData
        };

    } catch (error) {
        console.error("主进程文件系统操作错误:", error);
        return {
            success: false,
            message: `文件系统操作错误: ${error.message}`
        };
    }
});

console.log(process.versions.electron); // 检查 Electron 版本


// 创建主窗口
function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
        }
    });
    win.setMenuBarVisibility(false);
    win.loadFile('app/rotarenderer.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
