import { Document } from "../../content";
import info from "../src/info";
import { render } from "../index";
import {
  MacroNotFoundError,
  MacroBrokenLinkError,
  MacroRedirectedLinkError,
  MacroExecutionError,
} from "../src/errors";

describe("testing the main render() function", () => {
  it("non-fatal errors in macros are returned by render()", async () => {
    info.cleanURL = jest.fn((url) => {
      const result = url.toLowerCase();
      if (result === "/en-us/docs/web/css/dumber") {
        return "/en-us/docs/web/css/number";
      }
      return result;
    });
    const source = `
      {{cssxref("bigfoot")}}
      {{nonExistentMacro("yada")}}
      {{cssxref("dumber")}}
      {{cssxref("number")}}
      {{page("bogus")}}
      {{page("/en-US/docs/Web/B")}}
      {{page("/en-US/docs/Web/B", "bogus-section")}}
      {{page("/en-US/docs/Web/C")}}
    `.trim();
    Document.findByURL = jest.fn((url) => {
      return {
        "/en-us/docs/web/a": {
          url: "/en-US/docs/Web/A",
          metadata: {
            title: "A",
            locale: "en-US",
            slug: "Web/A",
            tags: ["Web"],
          },
          rawBody: source,
          isMarkdown: false,
          fileInfo: {
            path: "testing/content/files/en-us/web/a",
            frontMatterOffset: 8,
          },
        },
        "/en-us/docs/web/b": {
          url: "/en-US/docs/Web/B",
          metadata: {
            title: "B",
            locale: "en-US",
            slug: "Web/B",
            tags: ["Web"],
          },
          rawBody: '<p>{{cssxref("bigfoot")}}</p>',
          isMarkdown: false,
          fileInfo: {
            path: "testing/content/files/en-us/web/b",
            frontMatterOffset: 4,
          },
        },
        "/en-us/docs/web/c": {
          url: "/en-US/docs/Web/C",
          metadata: {
            title: "C",
            locale: "en-US",
            slug: "Web/C",
            tags: ["Web"],
          },
          rawBody: '{{page("/en-US/docs/Web/B")}}',
          isMarkdown: false,
          fileInfo: {
            path: "testing/content/files/en-us/web/c",
            frontMatterOffset: 5,
          },
        },
        "/en-us/docs/web/css/number": {
          url: "/en-US/docs/Web/CSS/number",
          metadata: {
            title: "<number>",
            locale: "en-US",
            slug: "Web/Number",
            "page-type": "css-type",
          },
          rawBody: "<p>This is the number test page.</p>",
          isMarkdown: false,
          fileInfo: {
            path: "testing/content/files/en-us/web/css/number",
            frontMatterOffset: 12,
          },
        },
      }[url];
    });
    const [$, errors] = await render("/en-us/docs/web/a");
    const result = $.html();
    // First, let's check the result.
    expect(result).toEqual(
      expect.stringContaining('{{nonExistentMacro("yada")}}')
    );
    expect(result).toEqual(expect.stringContaining('{{page("bogus")}}'));
    expect(result).toEqual(
      expect.stringContaining('{{page("/en-US/docs/Web/B", "bogus-section")}}')
    );
    const brokenLink = $(
      'a.page-not-created[title^="The documentation about this has not yet been written"]'
    );
    expect(brokenLink).toHaveLength(3);
    expect(brokenLink.html()).toBe("<code>bigfoot</code>");
    const otherLinks = $(`a[href="/en-US/docs/Web/CSS/number"]`);
    expect(otherLinks).toHaveLength(2);
    expect(otherLinks.eq(0).html()).toBe("<code>&lt;dumber&gt;</code>");
    expect(otherLinks.eq(1).html()).toBe("<code>&lt;number&gt;</code>");
    // Next, let's check the errors.
    expect(errors).toHaveLength(6);
    expect(errors[0]).toBeInstanceOf(MacroBrokenLinkError);
    expect(errors[0]).toHaveProperty("line", 4);
    expect(errors[0]).toHaveProperty("column", 4);
    expect(errors[0]).toHaveProperty(
      "filepath",
      "testing/content/files/en-us/web/b"
    );
    expect(errors[0]).toHaveProperty(
      "errorStack",
      expect.stringContaining("/en-US/docs/Web/CSS/bigfoot does not exist")
    );
    expect(errors[0]).toHaveProperty("macroName", "cssxref");
    expect(errors[0]).toHaveProperty("macroSource", '{{cssxref("bigfoot")}}');
    expect(errors[1]).toBeInstanceOf(MacroBrokenLinkError);
    expect(errors[1]).toHaveProperty("line", 8);
    expect(errors[1]).toHaveProperty("column", 1);
    expect(errors[1]).toHaveProperty(
      "filepath",
      "testing/content/files/en-us/web/a"
    );
    expect(errors[1]).toHaveProperty(
      "errorStack",
      expect.stringContaining("/en-US/docs/Web/CSS/bigfoot does not exist")
    );
    expect(errors[1]).toHaveProperty("macroName", "cssxref");
    expect(errors[1]).toHaveProperty("macroSource", '{{cssxref("bigfoot")}}');
    expect(errors[2]).toBeInstanceOf(MacroNotFoundError);
    expect(errors[2]).toHaveProperty("line", 9);
    expect(errors[2]).toHaveProperty("column", 7);
    expect(errors[2]).toHaveProperty(
      "filepath",
      "testing/content/files/en-us/web/a"
    );
    expect(errors[2]).toHaveProperty("macroName", "nonExistentMacro");
    expect(errors[2]).toHaveProperty(
      "errorStack",
      expect.stringContaining("Unknown macro nonexistentmacro")
    );
    expect(errors[3]).toBeInstanceOf(MacroRedirectedLinkError);
    expect(errors[3]).toHaveProperty("line", 10);
    expect(errors[3]).toHaveProperty("column", 7);
    expect(errors[3]).toHaveProperty(
      "filepath",
      "testing/content/files/en-us/web/a"
    );
    expect(errors[3]).toHaveProperty(
      "errorStack",
      expect.stringContaining(
        "/en-US/docs/Web/CSS/dumber redirects to /en-US/docs/Web/CSS/number"
      )
    );
    expect(errors[3]).toHaveProperty("macroName", "cssxref");
    expect(errors[3]).toHaveProperty("macroSource", '{{cssxref("dumber")}}');
    expect(errors[3]).toHaveProperty("redirectInfo.current", "dumber");
    expect(errors[3]).toHaveProperty("redirectInfo.suggested", "number");
    expect(errors[4]).toBeInstanceOf(MacroExecutionError);
    expect(errors[4]).toHaveProperty("line", 12);
    expect(errors[4]).toHaveProperty("column", 7);
    expect(errors[4]).toHaveProperty(
      "filepath",
      "testing/content/files/en-us/web/a"
    );
    expect(errors[4]).toHaveProperty("macroName", "page");
    expect(errors[4]).toHaveProperty(
      "errorStack",
      expect.stringContaining(
        "/en-us/docs/web/a references bogus, which does not exist"
      )
    );
    expect(errors[5]).toBeInstanceOf(MacroExecutionError);
    expect(errors[5]).toHaveProperty("line", 14);
    expect(errors[5]).toHaveProperty("column", 7);
    expect(errors[5]).toHaveProperty(
      "filepath",
      "testing/content/files/en-us/web/a"
    );
    expect(errors[5]).toHaveProperty("macroName", "page");
    expect(errors[5]).toHaveProperty(
      "errorStack",
      expect.stringContaining(
        'unable to find an HTML element with an "id" of "bogus-section" within /en-us/docs/web/b'
      )
    );
  });
});
