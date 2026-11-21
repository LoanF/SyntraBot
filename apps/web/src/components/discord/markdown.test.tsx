import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscordMarkdown } from './markdown';

const html = (text: string, names = {}) => renderToStaticMarkup(<DiscordMarkdown text={text} names={names} />);

describe('DiscordMarkdown', () => {
  it('n’interprète jamais de HTML venant d’un joueur', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
  });
  it('gras, italique, code, citation', () => {
    expect(html('**gras**')).toContain('<strong');
    expect(html('*it*')).toContain('<em>it</em>');
    expect(html('`x`')).toContain('<code');
    expect(html('> cité')).toContain('<blockquote');
  });
  it('liens https ouverts avec rel sécurisé, javascript: jamais cliquable', () => {
    const ok = html('voir https://exemple.test/a');
    expect(ok).toContain('href="https://exemple.test/a"');
    expect(ok).toContain('rel="noopener noreferrer nofollow"');
    expect(html('javascript:alert(1)')).not.toContain('<a');
  });
  it('mentions : noms fournis ou libellé générique, @everyone neutralisé en puce', () => {
    expect(html('<@123456789012345678>', { users: { '123456789012345678': 'Jade' } })).toContain('@Jade');
    expect(html('<#123456789012345678>')).toContain('#salon');
    expect(html('@everyone')).toContain('@everyone');
  });
  it('bloc de code multi-lignes', () => {
    expect(html('```js\nconst a = 1;\n```')).toContain('<pre');
  });
});
