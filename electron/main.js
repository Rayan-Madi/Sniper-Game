const { app, BrowserWindow } = require('electron')
const path = require('path')

// « npm run electron:dev » lance « electron . --dev » : un argument plutôt
// qu'une variable d'environnement, que cmd.exe (Windows) ne sait pas poser
// en tête de commande.
const isDev = process.argv.includes('--dev')

function createWindow() {
  // Pas de propriété icon : Electron garde son icône par défaut tant que le
  // jeu n'en a pas.
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: false,
    resizable: true,
    title: 'Sniper',
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.setMenuBarVisibility(false)

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
