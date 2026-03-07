# =============================================================================
# CNDQ Setup Script
# Installs all required tools and clones the project onto your machine.
#
# HOW TO RUN THIS SCRIPT
# ----------------------
# 1. Open the Start menu and search for "PowerShell"
# 2. Right-click "Windows PowerShell" and choose "Run as Administrator"
# 3. In the PowerShell window, type the following and press Enter:
#       Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#    When asked, type Y and press Enter.
# 4. Navigate to where you saved this file. For example, if it is in Downloads:
#       cd $HOME\Downloads
# 5. Run the script:
#       .\setup.ps1
#
# The script will pause once to ask you to log in to GitHub in your browser.
# Everything else is automatic.
# =============================================================================

$REPO_URL   = "https://github.com/TLTMedia/CNDQ.git"
$INSTALL_DIR = "C:\Sites"

# --- Helper functions --------------------------------------------------------

function Write-Step($number, $message) {
    Write-Host ""
    Write-Host "------------------------------------------------------------"
    Write-Host "STEP $number : $message"
    Write-Host "------------------------------------------------------------"
}

function Write-Ok($message)   { Write-Host "  OK  : $message" }
function Write-Info($message) { Write-Host "  INFO: $message" }
function Write-Fail($message) { Write-Host "  FAIL: $message" }

function Refresh-Path {
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user    = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = $machine + ";" + $user
}

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# --- Confirm administrator ---------------------------------------------------

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Write-Host ""
    Write-Host "ERROR: This script must be run as Administrator."
    Write-Host "Close this window, right-click PowerShell, and choose 'Run as Administrator'."
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "============================================================"
Write-Host "  CNDQ Setup"
Write-Host "  This will install the required tools and download the"
Write-Host "  project. It may take 5-10 minutes depending on your"
Write-Host "  internet connection."
Write-Host "============================================================"
Write-Host ""
Read-Host "Press Enter to begin"

# --- Step 1: Install tools ---------------------------------------------------

Write-Step 1 "Installing required tools"
Write-Info "Installing Git (version control)..."
winget install --id Git.Git --silent --accept-package-agreements --accept-source-agreements

Write-Info "Installing PHP (runs the web application)..."
winget install --id PHP.PHP.8.2 --silent --accept-package-agreements --accept-source-agreements

Write-Info "Installing GitHub CLI (for connecting to GitHub)..."
winget install --id GitHub.cli --silent --accept-package-agreements --accept-source-agreements

Write-Info "Installing Visual Studio Code (code editor)..."
winget install --id Microsoft.VisualStudioCode --silent --accept-package-agreements --accept-source-agreements

Write-Info "Installing Node.js (for running automated tests)..."
winget install --id OpenJS.NodeJS --silent --accept-package-agreements --accept-source-agreements

Write-Ok "Tool installation complete."

# --- Step 2: Refresh PATH ----------------------------------------------------

Write-Step 2 "Refreshing PATH"
Refresh-Path
Write-Ok "PATH updated."

# --- Step 3: Configure PHP extensions ----------------------------------------
#
# winget installs PHP but ships only template ini files. SQLite support
# (pdo_sqlite) is disabled by default and must be explicitly enabled.
# Without this step every database call returns "could not find driver".

Write-Step 3 "Configuring PHP extensions (SQLite support)"
$phpExe = (Get-Command php -ErrorAction SilentlyContinue).Source
if ($phpExe) {
    $phpDir    = Split-Path $phpExe
    $phpIni    = Join-Path $phpDir "php.ini"
    $phpIniDev = Join-Path $phpDir "php.ini-development"

    if (-not (Test-Path $phpIni)) {
        if (Test-Path $phpIniDev) {
            Copy-Item $phpIniDev $phpIni
            Write-Info "Created php.ini from php.ini-development"
        } else {
            Write-Fail "php.ini-development not found — cannot configure extensions."
        }
    }

    if (Test-Path $phpIni) {
        $ini = Get-Content $phpIni -Raw
        $ini = $ini -replace ';extension_dir = "ext"',  'extension_dir = "ext"'
        $ini = $ini -replace ';extension=pdo_sqlite',   'extension=pdo_sqlite'
        $ini = $ini -replace ';extension=sqlite3',      'extension=sqlite3'
        Set-Content $phpIni $ini -NoNewline
        Write-Ok "SQLite extensions enabled in php.ini."
    }


} else {
    Write-Info "PHP not found in PATH yet — close and reopen PowerShell as Administrator, then run the script again."
}

# --- Step 4: Verify installations --------------------------------------------

Write-Step 4 "Verifying installations"
$allOk = $true

foreach ($tool in @("git", "php", "gh", "code", "node", "npm")) {
    if (Test-Command $tool) {
        $ver = & $tool --version 2>&1 | Select-Object -First 1
        Write-Ok "$tool found: $ver"
    } else {
        Write-Fail "$tool not found. Close this window, reopen PowerShell as Administrator, and run the script again."
        $allOk = $false
    }
}

if (-not $allOk) {
    Write-Host ""
    Write-Host "Some tools were not found. This sometimes happens because Windows"
    Write-Host "needs a fresh terminal to see newly installed programs."
    Write-Host "Close this window, reopen PowerShell as Administrator, and run setup.ps1 again."
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# --- Step 4: GitHub login ----------------------------------------------------

Write-Step 5 "Connecting to GitHub"
Write-Host ""
Write-Host "  You will now be asked to log in to GitHub."
Write-Host "  The steps are:"
Write-Host "    1. Choose: GitHub.com"
Write-Host "    2. Choose: HTTPS"
Write-Host "    3. Choose: Login with a web browser"
Write-Host "    4. Copy the 8-character code shown in this window"
Write-Host "    5. Press Enter - your browser will open"
Write-Host "    6. Paste the code on the GitHub page and confirm"
Write-Host ""
Read-Host "Press Enter to start the GitHub login"

gh auth login

if ($LASTEXITCODE -ne 0) {
    Write-Fail "GitHub login did not complete. Run the script again to retry."
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Ok "GitHub login successful."

# --- Step 5: Create project folder -------------------------------------------

Write-Step 6 "Creating project folder at $INSTALL_DIR"
if (-not (Test-Path $INSTALL_DIR)) {
    New-Item -ItemType Directory -Path $INSTALL_DIR | Out-Null
    Write-Ok "Created $INSTALL_DIR"
} else {
    Write-Info "$INSTALL_DIR already exists, continuing."
}

# --- Step 6: Clone the repository --------------------------------------------

Write-Step 7 "Downloading the CNDQ project from GitHub"
$projectPath = Join-Path $INSTALL_DIR "CNDQ"

if (Test-Path $projectPath) {
    Write-Info "CNDQ folder already exists at $projectPath"
    Write-Info "Skipping clone. If you want a fresh copy, delete that folder and run this script again."
} else {
    Set-Location $INSTALL_DIR
    git clone $REPO_URL
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Clone failed. Check your internet connection and GitHub access, then try again."
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Ok "Project downloaded to $projectPath"
}

Set-Location $projectPath

# --- Step 7: Create database folder ------------------------------------------

Write-Step 8 "Creating database folder"
$dataPath = Join-Path $projectPath "data"
if (-not (Test-Path $dataPath)) {
    New-Item -ItemType Directory -Path $dataPath | Out-Null
    Write-Ok "Created $dataPath"
} else {
    Write-Info "data folder already exists."
}

# --- Step 8: Create local configuration file ---------------------------------

Write-Step 9 "Creating local configuration file"
$envFile    = Join-Path $projectPath ".env"
$envExample = Join-Path $projectPath ".env.example"

if (-not (Test-Path $envFile)) {
    Copy-Item $envExample $envFile
    Write-Ok "Created .env from .env.example"
} else {
    Write-Info ".env already exists, leaving it unchanged."
}

# --- Step 9: Install test tools ----------------------------------------------

Write-Step 10 "Installing automated test tools (Playwright)"
Write-Info "This downloads about 100MB and may take a few minutes..."
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Fail "npm install failed. Check your internet connection and try again."
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Ok "Test tools installed."

# --- Step 10: Done -----------------------------------------------------------

Write-Host ""
Write-Host "============================================================"
Write-Host "  SETUP COMPLETE"
Write-Host "============================================================"
Write-Host ""
Write-Host "  Project location : $projectPath"
Write-Host ""
Write-Host "  To start the application:"
Write-Host "    1. Open a new PowerShell window (does not need to be Administrator)"
Write-Host "    2. Run: cd C:\Sites"
Write-Host "    3. Run: php -S 127.0.0.1:8000"
Write-Host "    4. Open your browser and go to: http://127.0.0.1:8000/CNDQ/"
Write-Host ""
Write-Host "  To open the project in VS Code:"
Write-Host "    cd C:\Sites\CNDQ"
Write-Host "    code ."
Write-Host ""
Write-Host "  Full instructions are in: docs\PROFESSOR-SETUP.md"
Write-Host "  You can also read it on GitHub:"
Write-Host "  https://github.com/TLTMedia/CNDQ/blob/main/docs/PROFESSOR-SETUP.md"
Write-Host ""
Read-Host "Press Enter to exit"
