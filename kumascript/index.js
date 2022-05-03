import LRU from "lru-cache";

import { Document } from "../content/index.js";
import * as m2h from "../markdown/index.js";

import {
  INTERACTIVE_EXAMPLES_BASE_URL,
  LIVE_SAMPLES_BASE_URL,
} from "./src/constants.js";
import { info } from "./src/info.js";
import { render as renderMacros } from "./src/render.js";
import { buildLiveSamplePages } from "./src/live-sample.js";
import { HTMLTool } from "./src/api/util.js";
import { DEFAULT_LOCALE } from "../libs/constants/index.js";

const DEPENDENCY_LOOP_INTRO =
  'The following documents form a circular dependency when rendering (via the "page" and/or "IncludeSubnav" macros):';

const renderCache = new LRU({ max: 2000 });

const renderFromURL = async (
  url,
  { urlsSeen = null, selective_mode = false, invalidateCache = false } = {}
) => {
  const urlLC = url.toLowerCase();
  if (renderCache.has(urlLC)) {
    if (invalidateCache) {
      renderCache.delete(urlLC);
    } else {
      return renderCache.get(urlLC);
    }
  }

  urlsSeen = urlsSeen || new Set([]);
  if (urlsSeen.has(urlLC)) {
    throw new Error(
      `${DEPENDENCY_LOOP_INTRO}\n${[...urlsSeen, url].join(" ⭢ ")}`
    );
  }
  urlsSeen.add(urlLC);
  const prerequisiteErrorsByKey = new Map();
  const document = invalidateCache
    ? Document.findByURL(url, Document.MEMOIZE_INVALIDATE)
    : Document.findByURL(url);
  if (!document) {
    throw new Error(
      `From URL ${url} no folder on disk could be found. ` +
        `Tried to find a folder called ${Document.urlToFolderPath(url)}`
    );
  }
  let { metadata } = document;
  // If we're rendering a translation, merge in the parent document's
  // metadata into this metadata.
  if (metadata.locale !== DEFAULT_LOCALE) {
    const parentURL = url
      .toLowerCase()
      .replace(`/${metadata.locale.toLowerCase()}/`, `/${DEFAULT_LOCALE}/`);

    const parentDocument = invalidateCache
      ? Document.findByURL(parentURL, Document.MEMOIZE_INVALIDATE)
      : Document.findByURL(parentURL);
    if (parentDocument) {
      metadata = { ...parentDocument.metadata, ...metadata };
    }
  }

  const { rawBody, fileInfo, isMarkdown } = document;
  const rawHTML = isMarkdown
    ? await m2h.m2h(rawBody, { locale: metadata.locale })
    : rawBody;
  const [renderedHtml, errors] = await renderMacros(
    rawHTML,
    {
      ...metadata,
      url,
      tags: metadata.tags || [],
      selective_mode,
      interactive_examples: {
        base_url: INTERACTIVE_EXAMPLES_BASE_URL,
      },
      live_samples: { base_url: LIVE_SAMPLES_BASE_URL || url },
    },
    async (url) => {
      const [renderedHtml, errors] = await renderFromURL(info.cleanURL(url), {
        urlsSeen,
      });
      // Remove duplicate flaws. During the rendering process, it's possible for identical
      // flaws to be introduced when different dependency paths share common prerequisites.
      // For example, document A may have prerequisite documents B and C, and in turn,
      // document C may also have prerequisite B, and the rendering of document B generates
      // one or more flaws.
      for (const error of errors) {
        prerequisiteErrorsByKey.set(error.key, error);
      }
      return renderedHtml;
    }
  );

  // For now, we're just going to inject section ID's.
  // TODO: Sanitize the HTML and also filter the "src"
  //       attributes of any iframes.
  const tool = new HTMLTool(renderedHtml);
  tool.injectSectionIDs();
  renderCache.set(urlLC, [
    tool.html(),
    // The prerequisite errors have already been updated with their own file information.
    [...prerequisiteErrorsByKey.values()].concat(
      errors.map((e) => e.updateFileInfo(fileInfo))
    ),
  ]);
  return renderCache.get(urlLC);
};

export { buildLiveSamplePages, renderFromURL, renderCache };
