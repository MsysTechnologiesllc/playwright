/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { z } from '../../sdk/bundle';
import { defineTabTool } from './tool';

import type { Tab } from '../tab';

const elementInfoSchema = z.object({
  element: z.string().describe('Human-readable element description used to obtain permission to interact with the element'),
  ref: z.string().describe('Exact target element reference from the page snapshot'),
  button: z.enum(['left', 'right', 'middle']).optional().describe('Button to click, defaults to left'),
  modifiers: z.array(z.enum(['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'])).optional().describe('Modifier keys to press'),
});

const getElementInfo = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_get_element_info',
    title: 'Get Element Info',
    description: 'Extract detailed element information including CSS selector, XPath, outerHTML, and other attributes without performing an actual click',
    inputSchema: elementInfoSchema,
    type: 'action',
  },

  handle: async (tab, params, response) => {
    const locator = await tab.refLocator({ ref: params.ref, element: params.element });
    
    response.addCode(`// Extract element information for: ${params.element}`);
    response.addCode(`const elementInfo = await page.${locator.resolved}.evaluate((element) => {`);
    response.addCode(`  // Extract element details`);
    response.addCode(`});`);

    await tab.waitForCompletion(async () => {
      const elementInfo = await locator.locator.evaluate((element: Element) => {
        // Helper function to generate full XPath
        const getFullXPath = (el: Element): string => {
          if (el.id) {
            return `//*[@id="${el.id}"]`;
          }
          
          const parts: string[] = [];
          let current: Element | null = el;
          
          while (current && current.nodeType === Node.ELEMENT_NODE) {
            let index = 1;
            let sibling = current.previousSibling;
            
            while (sibling) {
              if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
                index++;
              }
              sibling = sibling.previousSibling;
            }
            
            const tagName = current.nodeName.toLowerCase();
            const xpathIndex = index > 1 ? `[${index}]` : '';
            parts.unshift(`${tagName}${xpathIndex}`);
            
            current = current.parentElement;
          }
          
          return '/' + parts.join('/');
        };

        // Helper function to generate CSS selector
        const getCssSelector = (el: Element): string => {
          if (el.id) {
            return `#${el.id}`;
          }
          
          const path: string[] = [];
          let current: Element | null = el;
          
          while (current && current.nodeType === Node.ELEMENT_NODE) {
            let selector = current.nodeName.toLowerCase();
            
            if (current.className && typeof current.className === 'string') {
              const classes = current.className.trim().split(/\s+/).filter(c => c);
              if (classes.length > 0) {
                selector += '.' + classes.join('.');
              }
            }
            
            // Add nth-child if needed for uniqueness
            const parent = current.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(
                child => child.nodeName === current!.nodeName
              );
              if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += `:nth-child(${index})`;
              }
            }
            
            path.unshift(selector);
            current = current.parentElement;
          }
          
          return path.join(' > ');
        };

        // Helper function to get associated label
        const getLabel = (el: Element): string => {
          const htmlEl = el as HTMLElement;
          
          // Check for aria-label
          if (htmlEl.getAttribute('aria-label')) {
            return htmlEl.getAttribute('aria-label')!;
          }
          
          // Check for aria-labelledby
          const labelledBy = htmlEl.getAttribute('aria-labelledby');
          if (labelledBy) {
            const labelElement = document.getElementById(labelledBy);
            if (labelElement) {
              return labelElement.textContent?.trim() || '';
            }
          }
          
          // Check for associated label element
          if (htmlEl.id) {
            const label = document.querySelector(`label[for="${htmlEl.id}"]`);
            if (label) {
              return label.textContent?.trim() || '';
            }
          }
          
          // Check for parent label
          const parentLabel = htmlEl.closest('label');
          if (parentLabel) {
            return parentLabel.textContent?.trim() || '';
          }
          
          // Check for title attribute
          if (htmlEl.getAttribute('title')) {
            return htmlEl.getAttribute('title')!;
          }
          
          return '';
        };

        // Get input value
        const getValue = (): string | null => {
          const inputEl = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
          if ('value' in inputEl) {
            return inputEl.value || null;
          }
          return null;
        };

        // Get placeholder/value label
        const getValueLabel = (): string => {
          const inputEl = element as HTMLInputElement | HTMLTextAreaElement;
          return inputEl.placeholder || '';
        };

        // Get text content
        const getText = (): string | null => {
          const textContent = element.textContent?.trim();
          return textContent || null;
        };

        return {
          url: window.location.href,
          tagName: element.tagName.toLowerCase(),
          id: element.id || null,
          fullXPath: getFullXPath(element),
          cssSelector: getCssSelector(element),
          outerHTML: element.outerHTML,
          value: getValue(),
          valueLabel: getValueLabel(),
          text: getText(),
          label: getLabel(element),
          timeStamp: Date.now(),
        };
      });

      response.addResult(JSON.stringify(elementInfo, null, 2));
    });
  },
});

export default [
  getElementInfo,
];
