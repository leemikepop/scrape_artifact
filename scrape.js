const puppeteer = require('puppeteer');
const fs = require('fs');
const { exec } = require('child_process');

function parseUrl(url) {
  const match = url.match(/\/builds\/submitted\/(\d+)\/([^/]+)\/latest/);
  if (!match) {
    throw new Error('URL 格式錯誤，無法解析 buildId 和 target');
  }
  return { buildId: match[1], target: match[2] };
}

async function scrapeAndFetch(url) {
  if (!url) {
    console.log('請提供 URL！使用方式: node scrape.js "<URL>"');
    return;
  }

  let buildId, target;
  try {
    ({ buildId, target } = parseUrl(url));
    console.log(`解析出的 buildId: ${buildId}, target: ${target}`);
  } catch (error) {
    console.error(error.message);
    return;
  }

  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  try {
    // 打開目標頁面
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // 取得 <body> 下的第一個 <script> 內容
    const scriptContent = await page.evaluate(() => {
      const firstScript = document.querySelector('body script');
      return firstScript ? firstScript.innerText : null;
    });

    if (!scriptContent) {
      console.log('找不到第一個 <script>，可能載入方式不同');
      return;
    }

    // console.log('第一個 <script> 內容:\n', scriptContent);

    // 嘗試解析 JSVariables
    const match = scriptContent.match(/var JSVariables = (\{.*?\});/s);
    if (match) {
      const jsVariables = JSON.parse(match[1]); // 解析 JSON
      const artifacts = jsVariables["artifacts"];
      
      if (!Array.isArray(artifacts)) {
        console.log('無效的 artifacts 資料');
        return;
      }

      // 存入 artifacts.json
      const filename = `${buildId}-${target}-artifacts.json`;
      fs.writeFileSync(filename, JSON.stringify(artifacts, null, 2), 'utf-8');
      console.log(`JSVariables 已儲存至 ${filename}`);

      // 逐一執行 fetch_artifact
      for (const artifact of artifacts) {
        if (artifact.name) {
          const command = `/home/leemi/Workspaces/android/fetch_artifact/fetch_artifact --target=${target} --build_id=${buildId} --artifact="${artifact.name}"`;
          console.log(`執行指令: ${command}`);

          exec(command, (error, stdout, stderr) => {
            if (error) {
              console.error(`錯誤: ${error.message}`);
              return;
            }
            if (stderr) {
              console.error(`錯誤輸出: ${stderr}`);
              return;
            }
            console.log(`成功輸出: ${stdout}`);
          });
        }
      }
    } else {
      console.log('JSVariables 未找到');
    }
  } catch (error) {
    console.error('發生錯誤:', error);
  } finally {
    await browser.close();
  }
}

// 讀取命令列參數
const url = process.argv[2];
scrapeAndFetch(url);
