import type { Page } from "playwright";
import type { FieldType, FormQuestion } from "@/lib/types";

function inferType(el: {
  tag: string;
  type: string;
  role: string;
}): FieldType {
  if (el.type === "file") return "file";
  if (el.type === "email") return "email";
  if (el.type === "tel") return "tel";
  if (el.type === "url") return "url";
  if (el.type === "number") return "number";
  if (el.type === "date") return "date";
  if (el.type === "radio") return "radio";
  if (el.type === "checkbox") return "checkbox";
  if (el.tag === "select") return "select";
  if (el.tag === "textarea") return "textarea";
  if (el.role === "combobox") return "combobox";
  return "text";
}

export async function inspectPageForm(page: Page): Promise<{
  title: string;
  company: string;
  location: string;
  questions: FormQuestion[];
}> {
  await page.waitForTimeout(1500);

  const meta = await page.evaluate(() => {
    const h1 = document.querySelector("h1")?.textContent?.trim() || "";
    const ogTitle =
      document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
    const company =
      document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ||
      document.querySelector('[class*="company"]')?.textContent?.trim() ||
      "";
    return { h1, ogTitle, company, host: location.hostname };
  });

  const questions = await page.evaluate(() => {
    const seen = new Set<string>();
    const out: {
      id: string;
      label: string;
      required: boolean;
      type: string;
      name?: string;
      options?: { label: string; value: string }[];
    }[] = [];

    const push = (item: (typeof out)[0]) => {
      const key = `${item.name || ""}|${item.label}`;
      if (!item.label || seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };

    const labelFor = (el: Element) => {
      const id = el.getAttribute("id");
      if (id) {
        const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lab?.textContent) return lab.textContent.trim();
      }
      const wrap = el.closest("label");
      if (wrap?.textContent) return wrap.textContent.trim();
      const aria = el.getAttribute("aria-label");
      if (aria) return aria;
      const labelled = el.getAttribute("aria-labelledby");
      if (labelled) {
        return labelled
          .split(/\s+/)
          .map((lid) => document.getElementById(lid)?.textContent?.trim() || "")
          .join(" ")
          .trim();
      }
      const prev = el.parentElement?.querySelector("label, p, span, legend, div");
      return prev?.textContent?.trim() || el.getAttribute("placeholder") || "";
    };

    const requiredOf = (el: Element) =>
      el.hasAttribute("required") ||
      el.getAttribute("aria-required") === "true" ||
      /required|\*/i.test(labelFor(el));

    document.querySelectorAll("input, textarea, select, [role='combobox']").forEach((el, i) => {
      const input = el as HTMLInputElement;
      const type = (input.type || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(type)) return;
      const name = input.name || el.getAttribute("name") || "";
      const label = labelFor(el).replace(/\s+/g, " ").slice(0, 180);
      if (!label && !name) return;
      let options: { label: string; value: string }[] | undefined;
      if (el.tagName.toLowerCase() === "select") {
        options = [...(el as HTMLSelectElement).options].map((o) => ({
          label: o.text.trim(),
          value: o.value,
        }));
      }
      push({
        id: name || `field_${i}`,
        name: name || undefined,
        label: label || name || `Field ${i + 1}`,
        required: requiredOf(el),
        type,
        options,
      });
    });

    document.querySelectorAll("fieldset").forEach((fs, i) => {
      const legend = fs.querySelector("legend")?.textContent?.trim();
      if (!legend) return;
      const radios = [...fs.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
      if (!radios.length) return;
      push({
        id: radios[0].name || `radio_${i}`,
        name: radios[0].name || undefined,
        label: legend.replace(/\s+/g, " "),
        required: radios.some((r) => r.required),
        type: "radio",
        options: radios.map((r) => ({
          label:
            fs.querySelector(`label[for="${r.id}"]`)?.textContent?.trim() ||
            r.value ||
            "Option",
          value: r.value,
        })),
      });
    });

    return out;
  });

  const mapped: FormQuestion[] = questions.map((q) => ({
    id: q.id,
    name: q.name,
    label: q.label,
    required: q.required,
    type: inferType({
      tag: q.type === "radio" ? "input" : "input",
      type: q.type,
      role: q.type,
    }),
    options: q.options,
  }));

  const title = meta.h1 || meta.ogTitle.split("|")[0]?.trim() || "Untitled role";
  return {
    title,
    company: meta.company || meta.host,
    location: "",
    questions: mapped,
  };
}

export async function clickApplyIfNeeded(page: Page) {
  const apply = page
    .getByRole("button", { name: /\bapply\b/i })
    .or(page.getByRole("link", { name: /\bapply\b/i }))
    .or(page.getByRole("button", { name: /submit application/i }));

  const first = apply.first();
  if (await first.count()) {
    const text = (await first.innerText().catch(() => "")).toLowerCase();
    if (text.includes("submit")) return;
    await first.click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
  }
}
