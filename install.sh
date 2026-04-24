#!/bin/bash

# Lumina macOS Build Automator
# This script converts index.html into a standalone .app

APP_NAME="Lumina"
BUILD_DIR="lumina_build"

echo "🚀 Starting build process for $APP_NAME..."

# 1. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install it from https://nodejs.org/"
    exit 1
fi

# 2. Check if index.html exists
if [ ! -f "index.html" ]; then
    echo "❌ Error: index.html not found in the current directory."
    exit 1
fi

# 3. Create build directory
echo "📁 Creating build directory..."
mkdir -p $BUILD_DIR
cp index.html $BUILD_DIR/
cd $BUILD_DIR

# 4. Initialize Node project
echo "📦 Initializing Node project..."
npm init -y > /dev/null

# 5. Create Electron main.js
echo "📝 Creating Electron entry point..."
cat <<EOF > main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "$APP_NAME",
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
EOF

# 6. Install Electron and Packager
echo "📥 Installing Electron dependencies (this may take a minute)..."
npm install electron electron-packager --save-dev > /dev/null

# 7. Package the app
echo "🏗️  Packaging macOS app..."
npx electron-packager . $APP_NAME --platform=darwin --arch=universal --out=../dist --overwrite

echo "------------------------------------------------"
echo "✅ Success! Your app is ready in the 'dist' folder."
echo "📂 Path: $(pwd)/../dist/$APP_NAME-darwin-universal/$APP_NAME.app"
echo "------------------------------------------------"
