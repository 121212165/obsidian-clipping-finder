/* Clipping Finder —— 方法论检索器
 * 命令：Ctrl/Cmd+P → "Clipping Finder: 检索方法论"
 * 输入关键词（可空格分词），按文件名/内容加权打分，回车或点击把命中片段插入光标处。
 */
const { Plugin, Modal, Notice, Setting, PluginSettingTab } = require("obsidian");

const DEFAULT_SETTINGS = {
  searchFolders: "00-Inbox/web-clipper,20-Knowledge",
  maxResults: 12,
  snippetLength: 120,
};

module.exports = class ClippingFinderPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.addCommand({
      id: "clipping-finder-search",
      name: "检索方法论并插入",
      callback: () => new FinderModal(this).open(),
    });

    this.addRibbonIcon("search", "方法论检索", () => new FinderModal(this).open());

    this.addSettingTab(new FinderSettingTab(this.app, this));
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /** 返回限定目录下的全部 md 文件（相对 vault 根路径） */
  candidateFiles() {
    const folders = this.settings.searchFolders
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const files = this.app.vault.getMarkdownFiles();
    if (!folders.length) return files;
    return files.filter((f) => folders.some((p) => f.path.startsWith(p)));
  }

  /** 简单打分检索：文件名命中 x6，正文命中按次数计 */
  async search(query) {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const results = [];
    for (const file of this.candidateFiles()) {
      const lowerPath = file.path.toLowerCase();
      let score = 0;
      let firstHit = "";
      for (const t of terms) {
        const lt = t.toLowerCase();
        if (lowerPath.includes(lt)) score += 6 * t.length;
        const cache = this.app.metadataCache.getFileCache(file);
        const title = cache && cache.frontmatter && cache.frontmatter.title;
        if (title && String(title).toLowerCase().includes(lt)) score += 6 * t.length;
        if (!firstHit) {
          const content = await this.app.vault.cachedRead(file);
          const idx = content.toLowerCase().indexOf(lt);
          if (idx >= 0) {
            score += 2 * t.length;
            const start = Math.max(0, idx - 20);
            firstHit = content
              .slice(start, idx + this.settings.snippetLength)
              .replace(/\s+/g, " ")
              .trim();
          }
        }
      }
      if (score > 0) results.push({ file, score, snippet: firstHit });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, this.settings.maxResults);
  }
};

class FinderModal extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.results = [];
    this.selectedIndex = 0;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "方法论检索" });

    const inputEl = contentEl.createEl("input", {
      type: "text",
      placeholder: "输入关键词，如：去AI味 导语 四要素",
    });
    inputEl.style.width = "100%";
    inputEl.style.padding = "8px";
    inputEl.style.marginBottom = "8px";

    this.resultEl = contentEl.createDiv();
    this.statusEl = contentEl.createEl("div", { text: "输入后自动检索…" });
    this.statusEl.style.cssText = "color: var(--text-muted); font-size: 12px; padding: 4px 0;";

    let debounce = null;
    inputEl.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        const q = inputEl.value;
        this.statusEl.setText("检索中…");
        this.results = await this.plugin.search(q);
        this.renderResults();
        this.selectedIndex = 0;
        this.highlightSelected();
      }, 200);
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.results.length - 1);
        this.highlightSelected();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.highlightSelected();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = this.results[this.selectedIndex];
        if (hit) {
          this.insertResult(hit);
          this.close();
        }
      } else if (e.key === "Escape") {
        this.close();
      }
    });

    inputEl.focus();
  }

  renderResults() {
    this.resultEl.empty();
    if (!this.results.length) {
      this.statusEl.setText("无命中，换个关键词试试。");
      return;
    }
    this.statusEl.setText(
      `${this.results.length} 条命中 · ↑↓ 选择 · Enter 插入链接 · Ctrl+Enter 插入片段`
    );
    this.resultEl.style.maxHeight = "300px";
    this.resultEl.style.overflowY = "auto";
    this.items = this.results.map((hit, i) => {
      const item = this.resultEl.createDiv();
      item.style.cssText =
        "padding: 6px 8px; border-radius: 6px; cursor: pointer; border: 1px solid transparent;";
      item.createEl("div", { text: hit.file.basename, cls: "clipping-finder-title" });
      const snip = item.createEl("div", {
        text: hit.snippet || hit.file.path,
        cls: "clipping-finder-snippet",
      });
      snip.style.cssText =
        "color: var(--text-muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
      item.addEventListener("click", (ev) => {
        this.insertResult(hit, ev.ctrlKey || ev.metaKey);
        this.close();
      });
      item.addEventListener("mousemove", () => {
        this.selectedIndex = i;
        this.highlightSelected();
      });
      return item;
    });
  }

  highlightSelected() {
    if (!this.items) return;
    this.items.forEach((el, i) => {
      el.style.background = i === this.selectedIndex ? "var(--background-modifier-hover)" : "transparent";
      el.style.borderColor = i === this.selectedIndex ? "var(--interactive-accent)" : "transparent";
    });
  }

  /** 默认插 wiki 链接；withSnippet 时插命中片段+链接 */
  async insertResult(hit, withSnippet) {
    const view = this.app.workspace.getActiveViewOfType(require("obsidian").MarkdownView);
    if (!view) {
      new Notice("没有活动编辑器");
      return;
    }
    const editor = view.editor;
    const link = `[[${hit.file.basename}]]`;
    let text = link;
    if (withSnippet && hit.snippet) {
      text = `> ${hit.snippet}\n> —— ${link}`;
    }
    editor.replaceSelection(text + "\n");
    new Notice(`已插入：${hit.file.basename}`);
  }
}

class FinderSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("检索目录")
      .setDesc("逗号分隔，相对 vault 根目录；留空检索全库")
      .addText((t) =>
        t.setValue(this.plugin.settings.searchFolders).onChange(async (v) => {
          this.plugin.settings.searchFolders = v;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("最大结果数")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.maxResults)).onChange(async (v) => {
          this.plugin.settings.maxResults = parseInt(v) || 12;
          await this.plugin.saveSettings();
        })
      );
  }
}
