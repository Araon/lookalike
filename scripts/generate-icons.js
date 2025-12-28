/**
 * Icon Generator for Lookalike Extension
 * Generates PNG icons from SVG or creates simple placeholder icons
 * 
 * Usage: node scripts/generate-icons.js
 * 
 * Note: This creates simple colored square icons as placeholders.
 * For production, replace with proper designed icons.
 */

const fs = require('fs');
const path = require('path');

// Simple PNG generator (creates solid color squares with a pattern)
function createPNG(width, height) {
  // PNG header
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdr = createIHDR(width, height);
  
  // IDAT chunk (image data)
  const idat = createIDAT(width, height);
  
  // IEND chunk
  const iend = createIEND();
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createIHDR(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.writeUInt8(8, 8);  // bit depth
  data.writeUInt8(2, 9);  // color type (RGB)
  data.writeUInt8(0, 10); // compression
  data.writeUInt8(0, 11); // filter
  data.writeUInt8(0, 12); // interlace
  
  return createChunk('IHDR', data);
}

function createIDAT(width, height) {
  const zlib = require('zlib');
  
  // Create raw image data (RGB)
  const rawData = [];
  
  // Primary color: #6366F1 (indigo)
  const primaryR = 0x63, primaryG = 0x66, primaryB = 0xF1;
  // Secondary color: #A5B4FC (light indigo)
  const secondaryR = 0xA5, secondaryG = 0xB4, secondaryB = 0xFC;
  // White for squares
  const whiteR = 0xFF, whiteG = 0xFF, whiteB = 0xFF;
  
  const cornerRadius = Math.floor(width * 0.15);
  const padding = Math.floor(width * 0.12);
  const squareSize = Math.floor((width - padding * 3) / 2);
  
  for (let y = 0; y < height; y++) {
    rawData.push(0); // Filter byte
    
    for (let x = 0; x < width; x++) {
      let r, g, b;
      
      // Check if we're in a corner that should be transparent (we'll use background color)
      const isCorner = isInCorner(x, y, width, height, cornerRadius);
      
      if (isCorner) {
        // Transparent (background) - use a light gray
        r = 0xF0; g = 0xF0; b = 0xF0;
      } else {
        // Check if we're in one of the squares
        const inSquare = isInSquare(x, y, padding, squareSize, width, height);
        
        if (inSquare.isIn) {
          // White squares, bottom-right is secondary color
          if (inSquare.row === 1 && inSquare.col === 1) {
            r = secondaryR; g = secondaryG; b = secondaryB;
          } else {
            r = whiteR; g = whiteG; b = whiteB;
          }
        } else {
          // Background color
          r = primaryR; g = primaryG; b = primaryB;
        }
      }
      
      rawData.push(r, g, b);
    }
  }
  
  const data = Buffer.from(rawData);
  const compressed = zlib.deflateSync(data);
  
  return createChunk('IDAT', compressed);
}

function isInCorner(x, y, width, height, radius) {
  // Top-left
  if (x < radius && y < radius) {
    const dx = radius - x;
    const dy = radius - y;
    return (dx * dx + dy * dy) > (radius * radius);
  }
  // Top-right
  if (x >= width - radius && y < radius) {
    const dx = x - (width - radius);
    const dy = radius - y;
    return (dx * dx + dy * dy) > (radius * radius);
  }
  // Bottom-left
  if (x < radius && y >= height - radius) {
    const dx = radius - x;
    const dy = y - (height - radius);
    return (dx * dx + dy * dy) > (radius * radius);
  }
  // Bottom-right
  if (x >= width - radius && y >= height - radius) {
    const dx = x - (width - radius);
    const dy = y - (height - radius);
    return (dx * dx + dy * dy) > (radius * radius);
  }
  return false;
}

function isInSquare(x, y, padding, squareSize, _width, _height) {
  // Define the four squares positions
  const squares = [
    { row: 0, col: 0, x: padding, y: padding },
    { row: 0, col: 1, x: padding * 2 + squareSize, y: padding },
    { row: 1, col: 0, x: padding, y: padding * 2 + squareSize },
    { row: 1, col: 1, x: padding * 2 + squareSize, y: padding * 2 + squareSize }
  ];
  
  for (const sq of squares) {
    const sqRadius = Math.floor(squareSize * 0.15);
    
    if (x >= sq.x && x < sq.x + squareSize &&
        y >= sq.y && y < sq.y + squareSize) {
      // Check corners of the square
      if (!isInCorner(x - sq.x, y - sq.y, squareSize, squareSize, sqRadius)) {
        return { isIn: true, row: sq.row, col: sq.col };
      }
    }
  }
  
  return { isIn: false };
}

function createIEND() {
  return createChunk('IEND', Buffer.alloc(0));
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = getCRC32Table();
  
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let crcTable = null;
function getCRC32Table() {
  if (crcTable) return crcTable;
  
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
  }
  return crcTable;
}

// Generate icons
const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, '..', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

sizes.forEach(size => {
  const png = createPNG(size, size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated ${filePath}`);
});

console.log('Icons generated successfully!');

