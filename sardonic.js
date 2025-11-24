#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SARDONIC
 * Corner-dwelling chaos cat inspired by Max Headroom
 * Features: Random rotation, random duration, glitch effects
 */

class Sardonic {
  constructor(options = {}) {
    this.framePattern = options.framePattern || 'w-*.jpg';
    this.frameDir = options.frameDir || './samples';
    this.outputFile = options.output || 'sardonic.mp4';
    this.size = options.size || 320;
    this.totalDuration = options.duration || 15;
    this.maxFrameDuration = options.maxFrameDuration || 2;
    this.minFrameDuration = options.minFrameDuration || 0.1;
    this.maxRotation = options.maxRotation || 15; // degrees
    this.glitchLevel = options.glitchLevel || 0; // 0-3
    this.frames = [];
  }

  /**
   * Find all frame files matching pattern using Unix command line
   */
  findFrames() {
    try {
      // Use Unix ls to handle glob pattern expansion
      const pattern = path.join(this.frameDir, this.framePattern);
      const output = execSync(`ls -1 ${pattern} 2>/dev/null || true`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      });

      const files = output
        .trim()
        .split('\n')
        .filter(f => f.length > 0)
        .sort();

      if (files.length === 0) {
        throw new Error(`No frames found matching: ${pattern}`);
      }

      this.frames = files;
      return files;
    } catch (error) {
      throw new Error(`Error finding frames: ${error.message}`);
    }
  }

  /**
   * Random duration
   */
  randomDuration() {
    const range = this.maxFrameDuration - this.minFrameDuration;
    return this.minFrameDuration + Math.random() * range;
  }

  /**
   * Random rotation angle
   */
  randomRotation() {
    return (Math.random() * 2 - 1) * this.maxRotation;
  }

  /**
   * Generate random sequence with rotation
   */
  generateSequence() {
    const sequence = [];
    let currentTime = 0;

    while (currentTime < this.totalDuration) {
      const remaining = this.totalDuration - currentTime;
      let duration;

      if (remaining <= this.maxFrameDuration) {
        duration = remaining;
      } else {
        duration = this.randomDuration();
        if (currentTime + duration > this.totalDuration) {
          duration = this.totalDuration - currentTime;
        }
      }

      // Pick random frame
      const frame = this.frames[Math.floor(Math.random() * this.frames.length)];
      const rotation = this.randomRotation();

      sequence.push({
        frame: frame,
        duration: duration,
        rotation: rotation,
        frameName: path.basename(frame)
      });

      currentTime += duration;
    }

    return sequence;
  }

  /**
   * Create rotated frame with effects
   */
  async createRotatedFrame(inputFrame, rotation, index) {
    const outputFrame = `/tmp/sardonic-${index}.png`;

    // Build ImageMagick command with rotation and resize
    const args = [
      inputFrame,
      '-resize', `${this.size}x${this.size}^`,
      '-gravity', 'center',
      '-extent', `${this.size}x${this.size}`,
      '-background', 'none',
      '-rotate', rotation.toFixed(2),
      '-gravity', 'center',
      '-extent', `${this.size}x${this.size}`,
    ];

    // Add glitch effects based on level
    if (this.glitchLevel >= 1) {
      // Slight color shift
      args.push('-modulate', '100,110,100');
    }

    if (this.glitchLevel >= 2) {
      // Add some noise
      args.push('-attenuate', '0.3', '+noise', 'Impulse');
    }

    if (this.glitchLevel >= 3) {
      // Chromatic aberration effect
      args.push('-channel', 'R', '-evaluate', 'add', '5');
    }

    args.push(outputFrame);

    return new Promise((resolve, reject) => {
      const convert = spawn('convert', args);

      convert.on('close', (code) => {
        if (code === 0) {
          resolve(outputFrame);
        } else {
          reject(new Error(`ImageMagick failed for frame ${index}`));
        }
      });

      convert.on('error', reject);
    });
  }

  /**
   * Create all rotated frames
   */
  async prepareFrames(sequence) {
    console.log('🎨 Preparing rotated frames...\n');

    const preparedFrames = [];

    for (let i = 0; i < sequence.length; i++) {
      const item = sequence[i];
      process.stdout.write(`  [${i + 1}/${sequence.length}] Rotating ${item.frameName} by ${item.rotation.toFixed(1)}°...`);

      const rotatedFrame = await this.createRotatedFrame(item.frame, item.rotation, i);
      preparedFrames.push({
        ...item,
        rotatedFrame: rotatedFrame
      });

      console.log(' ✓');
    }

    console.log('');
    return preparedFrames;
  }

  /**
   * Create ffmpeg concat file
   */
  createConcatFile(preparedFrames) {
    const concatPath = '/tmp/sardonic-concat.txt';
    let content = '';

    for (const item of preparedFrames) {
      content += `file '${item.rotatedFrame}'\n`;
      content += `duration ${item.duration.toFixed(3)}\n`;
    }

    // Add last frame again (ffmpeg concat quirk)
    const lastFrame = preparedFrames[preparedFrames.length - 1];
    content += `file '${lastFrame.rotatedFrame}'\n`;

    fs.writeFileSync(concatPath, content);
    return concatPath;
  }

  /**
   * Build glitch filter
   */
  buildGlitchFilter() {
    if (this.glitchLevel === 0) {
      return 'format=yuva420p';
    }

    const filters = ['format=yuva420p'];

    // Add scanlines
    if (this.glitchLevel >= 1) {
      filters.push('split[a][b]');
      filters.push('[a]geq=\'r=r(X,Y):g=g(X,Y):b=b(X,Y):a=if(not(mod(Y\\,3))\\,255\\,a(X,Y))\'[scanlines]');
      filters.push('[b][scanlines]overlay');
    }

    // Add random temporal noise
    if (this.glitchLevel >= 2) {
      filters.push('noise=alls=10:allf=t+u');
    }

    // Add chromatic aberration simulation
    if (this.glitchLevel >= 3) {
      filters.push('split[main][dup]');
      filters.push('[dup]lutrgb=r=0:b=0,crop=iw-4:ih:2:0[green]');
      filters.push('[main][green]overlay=0:0');
    }

    return filters.join(',');
  }

  /**
   * Create the Sardonic animation
   */
  async create() {
    console.log('📺 SARDONIC GENERATOR');
    console.log('='.repeat(60));
    console.log('='.repeat(60) + '\n');

    // Find frames
    this.findFrames();
    console.log(`✓ Found ${this.frames.length} frames`);
    this.frames.forEach((f, i) => {
      console.log(`  ${i + 1}. ${path.basename(f)}`);
    });
    console.log('');

    // Generate sequence
    const sequence = this.generateSequence();

    console.log(`📊 Animation Plan (${this.totalDuration}s total):`);
    console.log('─'.repeat(60));
    sequence.forEach((item, i) => {
      const rotSign = item.rotation >= 0 ? '+' : '';
      console.log(`  ${(i + 1).toString().padStart(2)}. ${item.frameName.padEnd(25)} ${item.duration.toFixed(3)}s  ${rotSign}${item.rotation.toFixed(1)}°`);
    });
    console.log('─'.repeat(60));
    console.log(`   Total cuts: ${sequence.length}`);
    console.log(`   Glitch level: ${this.glitchLevel}/3\n`);

    // Prepare all rotated frames
    const preparedFrames = await this.prepareFrames(sequence);

    // Create concat file
    const concatFile = this.createConcatFile(preparedFrames);

    // Build ffmpeg command
    const glitchFilter = this.buildGlitchFilter();

    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-vf', glitchFilter,
      '-c:v', 'h264',
      '-pix_fmt', 'yuva420p',
      '-preset', 'medium',
      '-crf', '23',
      '-y',
      this.outputFile
    ];

    console.log('🎬 Encoding Sardonic...\n');

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        if (data.toString().includes('frame=')) {
          process.stdout.write('.');
        }
      });

      ffmpeg.on('close', (code) => {
        console.log('\n');
        if (code === 0) {
          // Cleanup temp frames
          preparedFrames.forEach(item => {
            try {
              fs.unlinkSync(item.rotatedFrame);
            } catch (e) {}
          });
          fs.unlinkSync(concatFile);

          const stats = fs.statSync(this.outputFile);
          const sizeKB = (stats.size / 1024).toFixed(2);
          console.log('✅ Sardonic created!');
          console.log(`📦 Output: ${this.outputFile} (${sizeKB} KB)`);
          console.log(`⏱️  Duration: ${this.totalDuration}s`);
          console.log(`🎭 Animation cuts: ${sequence.length}`);
          resolve();
        } else {
          console.error('❌ ffmpeg failed:');
          console.error(stderr);
          reject(new Error('ffmpeg encoding failed'));
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  /**
   * Overlay Sardonic on existing video
   */
  async overlayOnVideo(inputVideo, options = {}) {
    const position = options.position || 'bottom-right'; // bottom-right, bottom-left, top-right, top-left
    const margin = options.margin || 20;
    const outputVideo = options.output || 'output-with-sardonic.mp4';

    console.log('\n📹 OVERLAYING SARDONIC');
    console.log('='.repeat(60));
    console.log(`   Video: ${inputVideo}`);
    console.log(`   Position: ${position}`);
    console.log(`   Margin: ${margin}px`);
    console.log('='.repeat(60) + '\n');

    // Get input video duration to calculate loop count
    let inputDuration = 0;
    try {
      const probeOutput = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputVideo}"`, {
        encoding: 'utf-8'
      });
      inputDuration = parseFloat(probeOutput.trim());
      console.log(`   Input duration: ${inputDuration.toFixed(1)}s`);
      console.log(`   Sardonic duration: ${this.totalDuration}s`);
    } catch (e) {
      console.warn('   Could not detect input duration, using stream_loop');
    }

    // Calculate position
    let x, y;
    switch (position) {
      case 'bottom-right':
        x = `main_w-overlay_w-${margin}`;
        y = `main_h-overlay_h-${margin}`;
        break;
      case 'bottom-left':
        x = margin;
        y = `main_h-overlay_h-${margin}`;
        break;
      case 'top-right':
        x = `main_w-overlay_w-${margin}`;
        y = margin;
        break;
      case 'top-left':
        x = margin;
        y = margin;
        break;
      default:
        x = `main_w-overlay_w-${margin}`;
        y = `main_h-overlay_h-${margin}`;
    }

    // Calculate how many times to loop sardonic to cover input duration
    const loopCount = inputDuration > 0 ? Math.ceil(inputDuration / this.totalDuration) : 50;

    const args = [
      '-i', inputVideo,
      '-stream_loop', (loopCount - 1).toString(),
      '-i', this.outputFile,
      '-filter_complex', `[0:v]fps=25[base];[1:v]fps=25[overlay];[base][overlay]overlay=${x}:${y}:shortest=0:format=auto`,
      '-c:v', 'h264',
      '-c:a', 'copy',
      '-preset', 'medium',
      '-crf', '23',
      '-t', inputDuration > 0 ? inputDuration.toString() : undefined,
      '-y',
      outputVideo
    ].filter(arg => arg !== undefined);

    console.log('🎬 Compositing video...\n');

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        if (data.toString().includes('frame=')) {
          process.stdout.write('.');
        }
      });

      ffmpeg.on('close', (code) => {
        console.log('\n');
        if (code === 0) {
          const stats = fs.statSync(outputVideo);
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          console.log('✅ Video created!');
          console.log(`📦 Output: ${outputVideo} (${sizeMB} MB)`);
          resolve(outputVideo);
        } else {
          console.error('❌ Overlay failed:');
          console.error(stderr);
          reject(new Error('Video overlay failed'));
        }
      });

      ffmpeg.on('error', reject);
    });
  }
}


// CLI interface - handle both direct execution and npm bin symlinks
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(__filename);

if (isMainModule) {
  const args = process.argv.slice(2);

  // Determine the installation directory for samples
  const __dirname = path.dirname(__filename);
  const samplesDir = path.join(__dirname, 'samples');

  const options = {
    framePattern: 'w-*.jpg',
    frameDir: samplesDir,
    output: 'sardonic.mp4',
    duration: 15,
    size: 128,
    maxFrameDuration: .8,
    minFrameDuration: 0.1,
    maxRotation: 15,
    glitchLevel: 1
  };

  let overlayMode = false;
  let inputVideo = null;
  let overlayOptions = {
    position: 'bottom-right',
    margin: 20
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--frames' || args[i] === '-f') {
      options.framePattern = args[++i];
    } else if (args[i] === '--dir' || args[i] === '-D') {
      options.frameDir = args[++i];
    } else if (args[i] === '--duration' || args[i] === '-d') {
      options.duration = parseFloat(args[++i]);
    } else if (args[i] === '--size' || args[i] === '-s') {
      options.size = parseInt(args[++i]);
    } else if (args[i] === '--rotation' || args[i] === '-r') {
      options.maxRotation = parseFloat(args[++i]);
    } else if (args[i] === '--glitch' || args[i] === '-g') {
      options.glitchLevel = parseInt(args[++i]);
    } else if (args[i] === '--output' || args[i] === '-o') {
      options.output = args[++i];
    } else if (args[i] === '--overlay' || args[i] === '-O') {
      overlayMode = true;
      inputVideo = args[++i];
    } else if (args[i] === '--position' || args[i] === '-p') {
      overlayOptions.position = args[++i];
    } else if (args[i] === '--margin' || args[i] === '-m') {
      overlayOptions.margin = parseInt(args[++i]);
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
SARDONIC - Corner-dwelling chaos cat
========================================

Inspired by Max Headroom's glitchy aesthetic. Creates a talking head
animation with random rotation and duration, perfect for corner overlays.

Usage: sardonic [options]

BASIC OPTIONS:
  -f, --frames <pattern>     Frame pattern (default: w-*.jpg)
  -D, --dir <path>           Directory containing frames (default: samples/)
  -d, --duration <seconds>   Animation duration (default: 15)
  -s, --size <pixels>        Output size (square) (default: 320)
  -r, --rotation <degrees>   Max rotation angle (default: 15)
  -g, --glitch <0-3>         Glitch effect level (default: 1)
  -o, --output <file>        Output file (default: sardonic.mp4)

OVERLAY OPTIONS:
  -O, --overlay <video>      Overlay on existing video
  -p, --position <pos>       Position: bottom-right, bottom-left,
                             top-right, top-left (default: bottom-right)
  -m, --margin <pixels>      Margin from edges (default: 20)

  -h, --help                 Show this help

EXAMPLES:

  # Create basic Sardonic animation (uses samples/w-*.jpg by default)
  sardonic

  # Use custom frames with longer duration
  sardonic --frames "cat-*.jpg" --dir . --duration 30

  # High glitch, more rotation
  sardonic --glitch 3 --rotation 30

  # Overlay on existing video (uses sample narration.mp4)
  sardonic --overlay samples/narration.mp4 --position bottom-left

  # Full workflow
  sardonic -f "w-*.jpg" -D samples -d 45 -g 2 -r 20 -o headroom.mp4
  sardonic -O samples/narration.mp4 -o final.mp4

GLITCH LEVELS:
  0 - Clean (no glitch)
  1 - Scanlines (Max Headroom classic)
  2 - Scanlines + noise
  3 - Full chaos (scanlines + noise + chromatic aberration)

TIPS:
  - Sample files included: w-*.jpg frames + narration.mp4
  - Use Midjourney to generate various expressions with same character
  - Include open/closed mouth frames
  - Add VHS distortion frames for authenticity
  - Random rotation approximates head bobbing
  - Works great with narration videos!
      `);
      process.exit(0);
    }
  }

  const sardonic = new Sardonic(options);

  sardonic.create()
    .then(() => {
      if (overlayMode && inputVideo) {
        console.log('\n🎭 Now overlaying on video...\n');
        return sardonic.overlayOnVideo(inputVideo, overlayOptions);
      }
    })
    .then(() => {
      console.log('\n🎉 All done! S-S-S-Sar Sardonic is ready!');
      console.log('   The chaos cat awaits in the corner...\n');
    })
    .catch((err) => {
      console.error('\n💥 Error:', err.message);
      process.exit(1);
    });
}

export default Sardonic;
