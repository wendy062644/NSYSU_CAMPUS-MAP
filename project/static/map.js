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
        layer.on('click', e => {
          const clickedLatLng = e.latlng; // 使用者點擊的位置
          const clickedCoord = [clickedLatLng.lng, clickedLatLng.lat];
          const nearest = findNearestNode(clickedCoord); // 找最近節點
          handlePointClick(e, nearest);
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

          coordinates.push(from);
          coordinates.push(to);
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
        const desc = feature.properties.description || "尚無建築介紹";
        buildings.push(item);
        tempList.push(item);

        layer.on('click', () => {
          const center = layer.getBounds().getCenter();
          const buildingCoord = [center.lng, center.lat];
          const nearestEnd = findNearestNode(buildingCoord);
          const html = `
            <strong>${name}</strong><br>
            ${desc}<br>
            <button onclick="routeFromCurrentLocation([${nearestEnd[0]}, ${nearestEnd[1]}])">
              目前位置出發
            </button>
          `;
          layer.bindPopup(html).openPopup();
        });

        layer.on('popupopen', () => {
          layer.setStyle({ color: "green" });
        });

        layer.on('popupclose', () => {
          layer.setStyle({ color: "red" });
        });
      }
    }).addTo(map);

    // 排序後加入選單
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
    const desc = found.layer.feature.properties.description || "尚無建築介紹";
    const center = found.layer.getBounds().getCenter();
    const html = `
      <strong>${found.name}</strong><br>
      ${desc}<br>
      <button onclick="routeFromCurrentLocation([${nearestEnd[0]}, ${nearestEnd[1]}])">
        目前位置出發
      </button>
    `;
    found.layer.bindPopup(html).openPopup();
    document.getElementById("searchInput").value = "";
  } else {
    alert("找不到符合的建築！");
  }
}

function selectFeature(name) {
  const found = buildings.find(b => b.name === name);
  if (found) {
    map.fitBounds(found.layer.getBounds());
    found.layer.setStyle({ color: "green" });
    
    const desc = found.layer.feature.properties.description || "尚無建築介紹";
    const center = found.layer.getBounds().getCenter();
    const html = `
      <strong>${found.name}</strong><br>
      ${desc}<br>
      <button onclick="routeFromCurrentLocation([${nearestEnd[0]}, ${nearestEnd[1]}])">
        目前位置出發
      </button>
    `;
    found.layer.bindPopup(html).openPopup();
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
        document.getElementById("searchInput").value = "";
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

const graph = {};
const coordinates = [];

let startCoord = null;
let endCoord = null;
let routeLine = null;
let markerStart = null;
let markerEnd = null;

function navigateToBuilding(endCoordRaw) {
  const endCoord = [parseFloat(endCoordRaw[0]), parseFloat(endCoordRaw[1])];

  if (!startCoord) {
    alert("請先點選地圖上的一個起點（例如道路節點）");
    return;
  }

  // 記得：Leaflet 是 lat,lng 但我們資料是 [lng, lat]
  if (markerEnd) map.removeLayer(markerEnd);
  markerEnd = L.circleMarker(endCoord.slice().reverse(), {
    radius: 8, color: "orange", fillColor: "orange", fillOpacity: 0.9
  }).addTo(map).bindPopup("終點").openPopup();

  const pathCoords = dijkstra(graph, coordKey(startCoord), coordKey(endCoord));
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(pathCoords.map(c => c.slice().reverse()), {
    color: "orange", weight: 4
  }).addTo(map);
}

function routeFromCurrentLocation(endCoord) {
  endCoord = endCoord.slice();

  // 確保 graph 已建好
  if (Object.keys(graph).length === 0) {
    alert("道路資料尚未初始化，請稍後再試");
    return;
  }

  // 使用 currentLocation（已經透過 GPS 或手動設定）
  if (currentLocation) {
    const nearest = findNearestNode(currentLocation); // 對齊起點
    startCoord = nearest;

    const [lat, lng] = [currentLocation[1], currentLocation[0]];
    if (markerStart) map.removeLayer(markerStart);
    markerStart = L.circleMarker([lat, lng], {
      radius: 8, color: "blue", fillColor: "blue", fillOpacity: 0.9
    }).addTo(map).bindPopup("目前位置（起點）").openPopup();

    if (markerEnd) map.removeLayer(markerEnd);
    markerEnd = L.circleMarker(endCoord.slice().reverse(), {
      radius: 8, color: "orange", fillColor: "orange", fillOpacity: 0.9
    }).addTo(map).bindPopup("目的地").openPopup();

    const pathCoords = dijkstra(graph, coordKey(startCoord), coordKey(endCoord));
    if (!pathCoords || pathCoords.length === 0) {
      alert("找不到導航路徑");
      return;
    }

    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(pathCoords.map(c => c.slice().reverse()), {
      color: "green", weight: 4
    }).addTo(map);
    return;
  }

  // 若尚未設定 currentLocation，嘗試 GPS
  if (!navigator.geolocation) {
    alert("您的瀏覽器不支援 GPS 定位");
    return;
  }

  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    currentLocation = [lng, lat];

    const nearest = findNearestNode(currentLocation);
    startCoord = nearest;

    if (markerStart) map.removeLayer(markerStart);
    markerStart = L.circleMarker([lat, lng], {
      radius: 8, color: "blue", fillColor: "blue", fillOpacity: 0.9
    }).addTo(map).bindPopup("目前位置（GPS）").openPopup();

    if (markerEnd) map.removeLayer(markerEnd);
    markerEnd = L.circleMarker(endCoord.slice().reverse(), {
      radius: 8, color: "orange", fillColor: "orange", fillOpacity: 0.9
    }).addTo(map).bindPopup("目的地").openPopup();

    const pathCoords = dijkstra(graph, coordKey(startCoord), coordKey(endCoord));
    if (!pathCoords || pathCoords.length === 0) {
      alert("找不到導航路徑");
      return;
    }

    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(pathCoords.map(c => c.slice().reverse()), {
      color: "green", weight: 4
    }).addTo(map);
  }, () => {
    alert("無法取得目前位置");
  });
}

function findNearestNode(coord) {
  let minDist = Infinity;
  let nearest = null;
  coordinates.forEach(c => {
    const d = turf.distance(turf.point(coord), turf.point(c));
    if (d < minDist) {
      minDist = d;
      nearest = c;
    }
  });
  return nearest;
}

function addEdge(a, b, distance) {
  if (!graph[a]) graph[a] = [];
  graph[a].push({ to: b, distance });
}

function coordKey(coord) {
  return `${coord[0]},${coord[1]}`;
}

// 點擊道路點以選擇起點或終點
function handlePointClick(e, coord) {
  if (currentLocation && startCoord) {
    if (!endCoord) {
      endCoord = coord;
      if (markerEnd) map.removeLayer(markerEnd);
      markerEnd = L.circleMarker(coord.slice().reverse(), {
        radius: 8, color: "orange", fillColor: "orange", fillOpacity: 0.9
      }).addTo(map).bindPopup("終點").openPopup();

      const pathCoords = dijkstra(graph, coordKey(startCoord), coordKey(endCoord));
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline(pathCoords.map(c => c.slice().reverse()), {
        color: "green", weight: 4
      }).addTo(map);
    } else {
      alert("起點與終點已選定，請重新整理或點擊清除");
    }
    return; // ❗不要讓 currentLocation 狀態下重設起點
  }

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

    const pathCoords = dijkstra(graph, coordKey(startCoord), coordKey(endCoord));
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(pathCoords.map(c => c.slice().reverse()), {
      color: "green", weight: 4
    }).addTo(map);
  } else {
    alert("起點與終點已選定，請重新整理或點擊清除");
  }
}

function clearRoute() {
  if (markerStart) map.removeLayer(markerStart);
  if (markerEnd) map.removeLayer(markerEnd);
  if (routeLine) map.removeLayer(routeLine);

  endCoord = null; // 只清終點

  // 如果有 currentLocation，則重新設定 startCoord 為最近節點
  if (currentLocation) {
    startCoord = findNearestNode(currentLocation);

    // 可重新顯示起點標記
    const [lat, lng] = [currentLocation[1], currentLocation[0]];
    markerStart = L.circleMarker([lat, lng], {
      radius: 8,
      color: "blue",
      fillColor: "blue",
      fillOpacity: 0.9
    }).addTo(map).bindPopup("目前位置（重新設定）");
  } else {
    startCoord = null; // 只有在完全沒 currentLocation 才清掉
  }
}

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

let currentLocation = null;
let manualClickHandler = null;

function setCurrentLocationByGPS() {
  if (!navigator.geolocation) {
    alert("您的瀏覽器不支援 GPS 定位");
    return;
  }

  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    currentLocation = [lng, lat];

    // 更新顯示
    document.getElementById("currentLocationDisplay").innerText =
      `GPS定位座標：(${lat.toFixed(6)}, ${lng.toFixed(6)})`;

    // 顯示在地圖上
    if (markerStart) map.removeLayer(markerStart);
    markerStart = L.circleMarker([lat, lng], {
      radius: 8,
      color: "blue",
      fillColor: "blue",
      fillOpacity: 0.9
    }).addTo(map).bindPopup("目前位置（GPS）").openPopup();

  }, () => {
    alert("無法取得目前位置");
  });
}

function enableClickToSetCurrent() { // location
  alert("請在地圖上點選作為目前位置");

  if (manualClickHandler) map.off('click', manualClickHandler);

  manualClickHandler = function (e) {
    const { lat, lng } = e.latlng;
    currentLocation = [lng, lat];

    document.getElementById("currentLocationDisplay").innerText = 
      `手動點選座標：(${lat.toFixed(6)}, ${lng.toFixed(6)})`;

    // 可選擇在地圖上標示
    if (markerStart) map.removeLayer(markerStart);
    markerStart = L.circleMarker([lat, lng], {
      radius: 8,
      color: "blue",
      fillColor: "blue",
      fillOpacity: 0.9
    }).addTo(map).bindPopup("目前位置（手動選取）").openPopup();

    map.off('click', manualClickHandler); // 只設定一次
  };

  map.on('click', manualClickHandler);
}