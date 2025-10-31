const { spawn } = require('child_process');
const fs = require('fs');

class VideoRenderer {
    constructor(outputPath = 'output.mp4', ffmpegPath, audioPath = null) { 
        this.ffmpegProcess = null;
        this.outputPath = outputPath;
        this.audioPath = audioPath;
        
        // 确保 ffmpegPath 存在，否则抛出错误或使用回退
        if (!ffmpegPath) {
            console.warn("VideoRenderer 构造函数未传入 FFmpeg 路径，尝试从环境变量获取。");
            this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
        } else {
            this.ffmpegPath = ffmpegPath;
        }
    }

    /**
     * @param {number} width 视频宽度
     * @param {number} height 视频高度
     * @param {number} frameRate 帧率 (fps)
     * @param {string} bitrate 视频码率 (例如 '2000k')
     */
    startRender(width, height, frameRate, bitrate) {
        if (this.ffmpegProcess) {
            console.warn('渲染已在进行中，请先结束上一个任务。');
            return;
        }

        const resolution = `${width}x${height}`;

        // FFmpeg 命令参数
        const args = [
            // 输入音频文件
            '-i', this.audioPath, 

            // 输入选项：从管道读取一系列图像
            '-f', 'image2pipe',
            // 不指定输入格式，直接依赖 image2pipe
            
            // 帧率
            '-r', frameRate.toString(),
            
            // 从 stdin 读取输入数据
            '-i', '-', 
            
            // 视频编码器
            '-c:v', 'libx264', 
            
            // 预设,加速编码
            '-preset', 'fast',
            
            // 设置输出分辨率 (可选，如果不设置，FFmpeg会尝试从输入帧中推断)
            // '-s', resolution, // 在 image2pipe 模式下，如果输入图像分辨率一致，通常不需要这个参数

            // 像素格式，yuv420p 具有最大兼容性
            '-pix_fmt', 'yuv420p',
            
            // 设置视频码率
            '-b:v', bitrate, 
            
            // 允许覆盖输出文件
            '-y', 
            
            // 输出路径
            this.outputPath
        ];

        console.log(`开始渲染视频，分辨率: ${resolution}, 帧率: ${frameRate}, 码率: ${bitrate}`);
        console.log(`FFmpeg 命令: ${this.ffmpegPath} ${args.join(' ')}`);

        // 启动 FFmpeg 子进程
        this.ffmpegProcess = spawn(this.ffmpegPath, args, {
            stdio: ['pipe', 'inherit', 'inherit'] // stdin 是 'pipe'，stdout/stderr 继承主进程
        });

        this.ffmpegProcess.on('error', (err) => {
            console.error('FFmpeg 进程启动失败:', err);
            this.ffmpegProcess = null;
        });

        this.ffmpegProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`FFmpeg 进程结束，视频渲染成功: ${this.outputPath}`);
            } else {
                console.error(`FFmpeg 进程退出，退出码: ${code}`);
            }
            this.ffmpegProcess = null;
        });
    }

    /**
     * 传入一帧图片数据 (Data URL 字符串)
     * @param {string} dataUrl
     */
    sendFrame(dataUrl) {
        if (!this.ffmpegProcess || !this.ffmpegProcess.stdin || this.ffmpegProcess.stdin.writableEnded) {
            console.error('FFmpeg 进程未启动或管道已关闭。');
            return;
        }

        try {
            const base64Data = dataUrl.split(';base64,').pop();
            const buffer = Buffer.from(base64Data, 'base64');
            this.ffmpegProcess.stdin.write(buffer, (err) => {
                if (err) {
                    console.error('写入 FFmpeg stdin 失败:', err);
                }
            });

        } catch (e) {
            console.error('处理 Data URL 或写入数据时发生错误:', e);
        }
    }

    /**
     * 结束渲染过程并关闭管道
     * @returns {Promise<string>} 返回渲染成功的输出路径
     */
    endRender() {
        return new Promise((resolve, reject) => {
            if (!this.ffmpegProcess || !this.ffmpegProcess.stdin || this.ffmpegProcess.stdin.writableEnded) {
                console.warn('FFmpeg 进程未启动或已关闭。');
                return resolve(this.outputPath);
            }

            console.log('结束渲染并关闭 FFmpeg 输入管道...');

            // 监听 FFmpeg 关闭事件
            this.ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    resolve(this.outputPath);
                } else {
                    reject(new Error(`FFmpeg 进程退出，退出码: ${code}`));
                }
            });
            
             this.ffmpegProcess.on('error', (err) => {
                reject(new Error(`FFmpeg 进程错误: ${err.message}`));
            });

            // 关闭 stdin
            this.ffmpegProcess.stdin.end();
            this.ffmpegProcess = null;
        });
    }
}

module.exports = {
    VideoRenderer
};