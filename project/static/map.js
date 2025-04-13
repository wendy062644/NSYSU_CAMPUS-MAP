const map = L.map('map').setView([22.6247, 120.2661], 17);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

fetch("Taoyuan.geojson")
  .then(res => res.json())
  .then(data => {
    // 顯示道路
    L.geoJSON(data, {
      style: { color: "blue", weight: 3 },
      onEachFeature: (feature, layer) => {
        layer.on('click', () => {
          alert("你點到了道路：" + (feature.properties.name || "未命名道路"));
        });
      }
    }).addTo(map);

    // 建立圖（圖資用）
    data.features.forEach(feature => {
      if (feature.geometry.type === "LineString") {
        const coords = feature.geometry.coordinates;
        for (let i = 0; i < coords.length - 1; i++) {
          const from = coords[i];
          const to = coords[i + 1];
          const dist = turf.distance(turf.point(from), turf.point(to));

          const key1 = coordKey(from);
          const key2 = coordKey(to);
          addEdge(key1, key2, dist);
          addEdge(key2, key1, dist);

          coordinates.push(from, to);
        }
      }
    });
  });

let buildingLayer;
let buildings = [];

fetch("Buildings.geojson")
  .then(res => res.json())
  .then(data => {
    const dropdown = document.getElementById("dropdown");

    // 先清空舊選項（保留第一個提示用）
    while (dropdown.options.length > 1) {
      dropdown.remove(1);
    }

    const tempList = [];

    buildingLayer = L.geoJSON(data, {
      style: {
        color: "red",
        weight: 2,
        fillOpacity: 0
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties.name || "未命名建築";
        const item = { name, layer };
        buildings.push(item);
        tempList.push(item);

        layer.on('click', () => {
          alert("你點到了建築物：" + name);
        });
      }
    }).addTo(map);

    // 🔠 排序後加入選單
    tempList.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')).forEach(b => {
      const option = document.createElement("option");
      option.value = b.name;
      option.text = b.name;
      dropdown.appendChild(option);
    });
  });

function searchFeature() {
  const keyword = document.getElementById("searchInput").value.trim();
  if (!keyword) return;

  const found = buildings.find(b => b.name.includes(keyword));
  if (found) {
    map.fitBounds(found.layer.getBounds());
    found.layer.setStyle({ color: "orange" });
    found.layer.bindPopup(`找到：${found.name}`).openPopup();
  } else {
    alert("找不到符合的建築！");
  }
}

function selectFeature(name) {
  const found = buildings.find(b => b.name === name);
  if (found) {
    map.fitBounds(found.layer.getBounds());
    found.layer.setStyle({ color: "green" });
    found.layer.bindPopup(`選擇：${found.name}`).openPopup();
  }
}

function showSuggestions() {
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
  const suggestions = document.getElementById("suggestions");
  suggestions.innerHTML = "";

  if (!keyword) return;

  buildings
    .filter(b => b.name.toLowerCase().includes(keyword))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
    .forEach(b => {
      const div = document.createElement("div");
      div.textContent = b.name;
      div.className = "suggestion-item";
      div.onclick = () => {
        map.fitBounds(b.layer.getBounds());
        b.layer.setStyle({ color: "orange" });
        b.layer.bindPopup(`找到：${b.name}`).openPopup();
        suggestions.innerHTML = "";
        document.getElementById("searchInput").value = b.name;
      };
      suggestions.appendChild(div);
    });
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("toggleSidebar");

  sidebar.classList.toggle("hidden");
  toggle.classList.toggle("collapsed");
}

const graph = {}; // 用鄰接表建立圖
const coordinates = []; // 儲存所有點

let startCoord = null;
let endCoord = null;
let routeLine = null;
let markerStart = null;
let markerEnd = null;

function addEdge(a, b, distance) {
  if (!graph[a]) graph[a] = [];
  graph[a].push({ to: b, distance });
}

function coordKey(coord) {
  return `${coord[0]},${coord[1]}`;
}

// 點擊道路點以選擇起點或終點
function handlePointClick(e, coord) {
  if (!startCoord) {
    startCoord = coord;
    if (markerStart) map.removeLayer(markerStart);
    markerStart = L.circleMarker(coord.slice().reverse(), {
      radius: 8, color: "blue", fillColor: "blue", fillOpacity: 0.9
    }).addTo(map).bindPopup("起點").openPopup();
  } else if (!endCoord) {
    endCoord = coord;
    if (markerEnd) map.removeLayer(markerEnd);
    markerEnd = L.circleMarker(coord.slice().reverse(), {
      radius: 8, color: "orange", fillColor: "orange", fillOpacity: 0.9
    }).addTo(map).bindPopup("終點").openPopup();

    // 找路徑並畫出來
    const pathCoords = dijkstra(graph, coordKey(startCoord), coordKey(endCoord));
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(pathCoords.map(c => c.slice().reverse()), {
      color: "red", weight: 4
    }).addTo(map);
  } else {
    alert("起點與終點已選定，請重新整理或點擊清除");
  }
}

function clearRoute() {
  if (markerStart) map.removeLayer(markerStart);
  if (markerEnd) map.removeLayer(markerEnd);
  if (routeLine) map.removeLayer(routeLine);
  startCoord = null;
  endCoord = null;
}

data.features.forEach(feature => {
  if (feature.geometry.type === "LineString") {
    const coords = feature.geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const from = coords[i];
      const to = coords[i + 1];
      const dist = turf.distance(turf.point(from), turf.point(to)); // km

      const key1 = coordKey(from);
      const key2 = coordKey(to);
      addEdge(key1, key2, dist);
      addEdge(key2, key1, dist);

      coordinates.push(from, to);
    }
  }
});

function dijkstra(graph, start, end) {
  const dist = {}, prev = {}, visited = {};
  const pq = new Set(Object.keys(graph));

  for (const node of pq) dist[node] = Infinity;
  dist[start] = 0;

  while (pq.size) {
    const u = [...pq].reduce((a, b) => dist[a] < dist[b] ? a : b);
    pq.delete(u);
    visited[u] = true;

    if (u === end) break;

    for (const neighbor of graph[u] || []) {
      if (visited[neighbor.to]) continue;
      const alt = dist[u] + neighbor.distance;
      if (alt < dist[neighbor.to]) {
        dist[neighbor.to] = alt;
        prev[neighbor.to] = u;
      }
    }
  }

  // 回溯路徑
  const path = [];
  let u = end;
  while (u) {
    path.unshift(u);
    u = prev[u];
  }

  return path.map(key => key.split(',').map(Number)); // [lon, lat]
}