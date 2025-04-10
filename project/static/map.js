const map = L.map('map').setView([22.6247, 120.2661], 17);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

fetch("Taoyuan.geojson")
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      style: { color: "blue", weight: 3 },
      onEachFeature: (feature, layer) => {
        layer.on('click', () => {
          alert("你點到了道路：" + (feature.properties.name || "未命名道路"));
        });
      }
    }).addTo(map);
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
