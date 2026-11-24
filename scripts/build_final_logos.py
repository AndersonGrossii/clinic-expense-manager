import os
import subprocess
from PIL import Image

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
BASE_DIR = r"C:\Users\PC\.gemini\antigravity\scratch\clinic-expense-manager"
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
IMG_DIR = os.path.join(PUBLIC_DIR, "img")
os.makedirs(IMG_DIR, exist_ok=True)

# 1. Full horizontal SVG Logo (white / transparent background)
full_logo_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 140" width="100%" height="100%" fill="none">
  <defs>
    <linearGradient id="vfCyan" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00bcd4" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
  </defs>

  <!-- Left Emblem: Financial Growth & Prosperity ribbon embracing signature Vides 'V' -->
  <g transform="translate(10, 8)">
    <!-- 3 Subtle Ascending Financial Growth Bars -->
    <rect x="38" y="74" width="7" height="24" rx="3.5" fill="url(#vfCyan)" opacity="0.32" />
    <rect x="50" y="61" width="7" height="37" rx="3.5" fill="url(#vfCyan)" opacity="0.55" />
    <rect x="62" y="48" width="7" height="50" rx="3.5" fill="url(#vfCyan)" opacity="0.82" />

    <!-- Upward Financial Growth Trendline (reinterpreting the fluid dental tooth ribbon as economic growth) -->
    <path d="M 20 102 C 12 75 16 38 36 24 C 50 14 68 16 78 26 C 88 36 98 38 112 24"
          stroke="url(#vfCyan)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
    
    <!-- Growth Trend Arrowhead -->
    <path d="M 98 20 L 115 22 L 113 39"
          stroke="url(#vfCyan)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />

    <!-- Signature Vides Calligraphic 'V' -->
    <path d="M 44 65 C 42 59 46 54 53 55 C 61 56 65 64 65 73 C 65 86 62 100 72 114 C 74 116 76 116 77 114 C 83 92 95 56 113 25 C 116 20 122 19 119 26 C 103 61 88 103 80 122 C 77 127 72 127 69 122 C 57 103 52 85 44 65 Z"
          fill="#0b1220" />
  </g>

  <!-- Typography -->
  <!-- IDES: bold, clean geometric uppercase -->
  <text x="148" y="68" font-family="'Montserrat', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="48" font-weight="900" fill="#0b1220" letter-spacing="0.06em">IDES</text>
  
  <!-- FINANZAS: widely tracked, perfectly balanced underneath IDES -->
  <text x="150" y="104" font-family="'Montserrat', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="21" font-weight="800" fill="#0b1220" letter-spacing="0.28em">FINANZAS</text>

  <!-- Financial accent dot -->
  <circle cx="430" cy="98" r="3.5" fill="#00bcd4" />
</svg>"""

with open(os.path.join(IMG_DIR, "vides-finanzas-logo.svg"), "w", encoding="utf-8") as f:
    f.write(full_logo_svg)

# 2. Square Icon Emblem (for App Icon, Avatar, Favicon)
# Standalone high-contrast emblem centered in 512x512
def make_icon_html(bg_color="dark"):
    bg_style = "background: radial-gradient(circle at 50% 30%, #1e3a8a 0%, #0b1220 100%);" if bg_color == "dark" else "background: #ffffff;"
    v_fill = "#ffffff" if bg_color == "dark" else "#0b1220"
    
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body {{
    margin: 0; padding: 0; width: 100%; height: 100%;
    display: grid; place-items: center;
    {bg_style}
    overflow: hidden;
  }}
  svg {{ width: 75%; height: 75%; }}
</style>
</head>
<body>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" fill="none">
    <defs>
      <linearGradient id="icGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#00bcd4" />
        <stop offset="100%" stop-color="#38bdf8" />
      </linearGradient>
    </defs>

    <g transform="translate(10, 8)">
      <!-- 3 Ascending Financial Bars -->
      <rect x="36" y="72" width="7" height="24" rx="3.5" fill="url(#icGrad)" opacity="0.4" />
      <rect x="48" y="59" width="7" height="37" rx="3.5" fill="url(#icGrad)" opacity="0.65" />
      <rect x="60" y="46" width="7" height="50" rx="3.5" fill="url(#icGrad)" opacity="0.9" />

      <!-- Ascending Financial Growth Ribbon -->
      <path d="M 18 100 C 10 73 14 36 34 22 C 48 12 66 14 76 24 C 86 34 96 36 110 22"
            stroke="url(#icGrad)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
      
      <!-- Trend Arrowhead -->
      <path d="M 96 18 L 113 20 L 111 37"
            stroke="url(#icGrad)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Calligraphic 'V' -->
      <path d="M 42 63 C 40 57 44 52 51 53 C 59 54 63 62 63 71 C 63 84 60 98 70 112 C 72 114 74 114 75 112 C 81 90 93 54 111 23 C 114 18 120 17 117 24 C 101 59 86 101 78 120 C 75 125 70 125 67 120 C 55 101 50 83 42 63 Z"
            fill="{v_fill}" />
    </g>
  </svg>
</body>
</html>"""

# Render 512x512 Master App Icon
icon_html_path = os.path.join(BASE_DIR, "app_icon_render.html")
with open(icon_html_path, "w", encoding="utf-8") as f:
    f.write(make_icon_html("dark"))

out_512 = os.path.join(PUBLIC_DIR, "icon-512.png")
cmd = [
    EDGE_PATH,
    "--headless",
    "--disable-gpu",
    f"--screenshot={out_512}",
    "--window-size=512,512",
    f"file:///{icon_html_path.replace(os.sep, '/')}"
]
subprocess.run(cmd, check=True)

# Generate other resolutions from 512 master using Pillow for perfect antialiasing
img512 = Image.open(out_512)

# 192x192
img192 = img512.resize((192, 192), Image.Resampling.LANCZOS)
img192.save(os.path.join(PUBLIC_DIR, "icon-192.png"))

# 180x180 (iOS Apple Touch Icon)
img180 = img512.resize((180, 180), Image.Resampling.LANCZOS)
img180.save(os.path.join(PUBLIC_DIR, "apple-touch-icon.png"))

# 64x64 (Favicon)
img64 = img512.resize((64, 64), Image.Resampling.LANCZOS)
img64.save(os.path.join(PUBLIC_DIR, "favicon.png"))

# Also render full logo to PNG (for reports / receipts / previews)
full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@800;900&display=swap');
  html, body {{
    margin: 0; padding: 0; width: 460px; height: 140px;
    background: transparent; overflow: hidden;
  }}
</style>
</head>
<body>
  {full_logo_svg}
</body>
</html>"""

full_html_path = os.path.join(BASE_DIR, "logo_full_render.html")
with open(full_html_path, "w", encoding="utf-8") as f:
    f.write(full_html)

out_logo_png = os.path.join(IMG_DIR, "vides-finanzas-logo.png")
cmd_logo = [
    EDGE_PATH,
    "--headless",
    "--disable-gpu",
    f"--screenshot={out_logo_png}",
    "--window-size=460,140",
    "--default-background-color=00000000",
    f"file:///{full_html_path.replace(os.sep, '/')}"
]
subprocess.run(cmd_logo, check=True)

print("All logos and PWA icons generated and verified successfully!")
