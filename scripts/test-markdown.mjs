import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { MarkdownResponse } = await server.ssrLoadModule('/src/components/copilot/MarkdownResponse.tsx');
  const render = content => renderToStaticMarkup(createElement(MarkdownResponse, { content }));
  const html = render('# Strategy report\n\n**Return:** 12%\n\n- First\n- Second\n\n| Metric | Value |\n| --- | --- |\n| Sharpe | 1.2 |\n\n```python\nprint("test")\n```\n\n> Paper trading only\n\n[Source](https://example.com)');
  for (const tag of ['h1', 'strong', 'ul', 'li', 'table', 'th', 'td', 'pre', 'code', 'blockquote']) {
    assert.match(html, new RegExp(`<${tag}[ >]`), `Expected semantic ${tag}`);
  }
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /class="markdown-table"/);
  const unsafe = render('<script>alert(1)</script>\n\n[Bad](javascript:alert%281%29)\n\n![Tracking](https://example.com/track.png)');
  assert.doesNotMatch(unsafe, /<script|href="javascript:|<img/);
  assert.match(render('```python\nunfinished = 1'), /<pre/);
  assert.match(render('Plain reply with no markdown.'), /<p>Plain reply with no markdown\.<\/p>/);
  console.log('Markdown checks passed: structure, tables, code, links, unsafe HTML/URLs, remote images, incomplete fences, plain text.');
} finally {
  await server.close();
}
