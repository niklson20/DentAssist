const SERBIAN_SENTENCES = new Intl.Segmenter("sr-Latn", { granularity: "sentence" });

export function splitClinicDescription(description: string): string[] {
  const paragraphs: string[] = [];
  for (const line of description.split(/\r?\n+/)) {
    for (const { segment } of SERBIAN_SENTENCES.segment(line)) {
      const sentence = segment.trim();
      if (!sentence) {
        continue;
      }
      const previous = paragraphs.at(-1);
      if (previous && /\b(?:dr|mr|br|prof|etc|npr|str|ul)\.$/iu.test(previous)) {
        paragraphs[paragraphs.length - 1] = `${previous} ${sentence}`;
      } else {
        paragraphs.push(sentence);
      }
    }
  }
  return paragraphs;
}
