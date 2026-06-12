const cache = new Map();

async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const data = await res.json();
  cache.set(path, data);
  return data;
}

export const loadManifest = () => getJSON("content/manifest.json");
export const loadTopic = (slug) => getJSON(`content/topics/${slug}.json`);
export const loadExam = (id) => getJSON(`content/exams/exam-${id}.json`);
