let lineChart = null;
let barChart = null;
let doughnutChart = null;

const districtSelect = document.getElementById("district-select");
const dashboard = document.getElementById("dashboard");
const loading = document.getElementById("loading");
const initialMessage = document.getElementById("initial-message");
const districtTitle = document.getElementById("district-title");
const districtSubtitle = document.querySelector(".subtitle");
const geoStatus = document.getElementById("geo-status");

const cardHouseholds = document.getElementById("card-households");
const cardHouseholdsComp = document.getElementById("card-households-comp");
const cardAvgDays = document.getElementById("card-avg-days");
const cardAvgDaysComp = document.getElementById("card-avg-days-comp");
const cardWagesPaid = document.getElementById("card-wages-paid");
const cardWagesPaidComp = document.getElementById("card-wages-paid-comp");
const cardIndividualsWorked = document.getElementById(
  "card-individuals-worked"
);
const cardIndividualsWorkedComp = document.getElementById(
  "card-individuals-worked-comp"
);
const cardTimelyPayments = document.getElementById("card-timely-payments");
const cardTimelyPaymentsComp = document.getElementById(
  "card-timely-payments-comp"
);

const langEnBtn = document.getElementById("lang-en");
const langHiBtn = document.getElementById("lang-hi");
const speakButton = document.getElementById("speak-button");

let currentLang = "en";
let summaryText = "";

districtSelect.addEventListener("change", onDistrictSelect);
langEnBtn.addEventListener("click", () => setLanguage("en"));
langHiBtn.addEventListener("click", () => setLanguage("hi"));
speakButton.addEventListener("click", speakSummary);
window.addEventListener("load", autoDetectLocation); // Auto-detect on load

async function onDistrictSelect() {
  const district = districtSelect.value;
  if (!district) {
    dashboard.classList.add("hidden");
    initialMessage.classList.remove("hidden");
    return;
  }

  const selectedOption = districtSelect.options[districtSelect.selectedIndex];
  const districtName_EN = selectedOption.dataset.en;
  const districtName_HI = selectedOption.dataset.hi;

  dashboard.classList.add("hidden");
  initialMessage.classList.add("hidden");
  loading.classList.remove("hidden");

  try {
    const response = await fetch(
      `/api/mgnrega?state=MAHARASHTRA&district=${district}`
    );
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const apiData = await response.json();

    if (apiData.count === 0) {
      if (geoStatus) geoStatus.innerText = "";
      initialMessage.innerText = "No data found for this district.";
      initialMessage.classList.remove("hidden");
      return;
    }

    updateUI(apiData.data, districtName_EN, districtName_HI);

    loading.classList.add("hidden");
    dashboard.classList.remove("hidden");
  } catch (error) {
    console.error("Fetch error:", error);
    loading.classList.add("hidden");
    initialMessage.innerText = "Error loading data. Please try again.";
    initialMessage.classList.remove("hidden");
  }
}

function updateUI(records, districtName_EN, districtName_HI) {
  const latest = records[0];
  const previous = records[1] || latest;

  districtTitle.innerText =
    currentLang === "en" ? districtName_EN : districtName_HI;
  districtTitle.dataset.en = districtName_EN;
  districtTitle.dataset.hi = districtName_HI;

  const monthName =
    latest.month.charAt(0).toUpperCase() + latest.month.slice(1).toLowerCase();
  const subtitleText = {
    en: `Latest data for ${monthName}, ${latest.fin_year}`,
    hi: `${monthName}, ${latest.fin_year} के लिए नवीनतम डेटा`,
  };
  districtSubtitle.innerText = subtitleText[currentLang];
  districtSubtitle.dataset.en = subtitleText.en;
  districtSubtitle.dataset.hi = subtitleText.hi;

  updateCard(
    cardHouseholds,
    cardHouseholdsComp,
    latest.total_households_worked,
    previous.total_households_worked,
    "households"
  );
  updateCard(
    cardAvgDays,
    cardAvgDaysComp,
    latest.avg_days_employment,
    previous.avg_days_employment,
    "days"
  );
  updateCard(
    cardWagesPaid,
    cardWagesPaidComp,
    latest.wages_paid,
    previous.wages_paid,
    "wages"
  );
  updateCard(
    cardIndividualsWorked,
    cardIndividualsWorkedComp,
    latest.total_individuals_worked,
    previous.total_individuals_worked,
    "individuals"
  );
  updateCard(
    cardTimelyPayments,
    cardTimelyPaymentsComp,
    latest.pc_payments_on_time,
    previous.pc_payments_on_time,
    "%"
  );

  updateLineChart(records);
  updateBarChart(latest);
  updateDoughnutChart(latest);

  prepareSummary(latest, districtName_EN, districtName_HI);
}

function updateCard(valueEl, compEl, latestVal, prevVal, unit) {
  const diff = latestVal - prevVal;
  let compText = { en: "", hi: "" };
  let compClass = "";

  if (diff > 0) {
    compText.en = `⬆ ${diff.toLocaleString("en-IN")} more than last month`;
    compText.hi = `⬆ ${diff.toLocaleString("en-IN")} पिछले महीने से अधिक`;
    compClass = "positive";
  } else if (diff < 0) {
    compText.en = `⬇ ${Math.abs(diff).toLocaleString(
      "en-IN"
    )} less than last month`;
    compText.hi = `⬇ ${Math.abs(diff).toLocaleString(
      "en-IN"
    )} पिछले महीने से कम`;
    compClass = "negative";
  } else {
    compText.en = "No change from last month";
    compText.hi = "पिछले महीने से कोई बदलाव नहीं";
  }

  valueEl.innerText = `${latestVal.toLocaleString("en-IN")}${
    unit === "%" ? "%" : ""
  }`;
  compEl.innerText = compText[currentLang];
  compEl.dataset.en = compText.en;
  compEl.dataset.hi = compText.hi;
  compEl.className = `card-comparison ${compClass}`;
}

function updateLineChart(records) {
  if (lineChart) {
    lineChart.destroy();
  }

  const monthMap = {
    Jan: 0,
    Feb: 1,
    March: 2,
    April: 3,
    May: 4,
    June: 5,
    July: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  const getSortableDate = (r) => {
    const monthIndex = monthMap[r.month];
    const year = parseInt(r.fin_year.slice(0, 4));

    return new Date(year, monthIndex, 1);
  };

  const sortedRecords = records.sort((a, b) => {
    return getSortableDate(a) - getSortableDate(b);
  });

  const chartData = sortedRecords.slice(-12);

  // To get the 12 OLDEST months:
  // const chartData = sortedRecords.slice(0, 12);

  // 5. Build your chart. DO NOT use .reverse().
  const labels = chartData.map(
    (r) => `${r.month.slice(0, 3)} ${r.fin_year.slice(2, 4)}`
  );
  const data = chartData.map((r) => r.total_individuals_worked);

  lineChart = new Chart(document.getElementById("line-chart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Individuals Worked",
          data: data,
          borderColor: "#005a9e",
          backgroundColor: "rgba(0, 90, 158, 0.1)",
          fill: true,
          tension: 0.1,
        },
      ],
    },
    options: { responsive: true },
  });
}

function updateBarChart(latest) {
  if (barChart) {
    barChart.destroy();
  }
  const data = [
    latest.sc_persondays,
    latest.st_persondays,
    latest.women_persondays,
    latest.differently_abled_persondays,
  ];
  console.log("Bar Chart Data:", data);
  barChart = new Chart(document.getElementById("bar-chart"), {
    type: "bar",
    data: {
      labels: ["SC", "ST", "Women", "Differently Abled"],
      datasets: [
        {
          label: "Persondays",
          data: data,
          backgroundColor: ["#00aaff", "#007bff", "#ff8c00"],
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
    },
  });
}

function updateDoughnutChart(latest) {
  if (doughnutChart) {
    doughnutChart.destroy();
  }
  const completed = latest.total_hhs_completed_100_days;
  const worked = latest.total_households_worked;
  const notCompleted = worked - completed;
  doughnutChart = new Chart(document.getElementById("doughnut-chart"), {
    type: "doughnut",
    data: {
      labels: [
        `Completed 100 Days (${completed.toLocaleString("en-IN")})`,
        `Worked (< 100 Days) (${notCompleted.toLocaleString("en-IN")})`,
      ],
      datasets: [
        {
          data: [completed, notCompleted],
          backgroundColor: ["#28a745", "#dde3e8"],
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
    },
  });
}

function setLanguage(lang) {
  currentLang = lang;
  langEnBtn.classList.toggle("active", lang === "en");
  langHiBtn.classList.toggle("active", lang === "hi");
  document.documentElement.lang = lang;
  const elements = document.querySelectorAll("[data-en]");
  elements.forEach((el) => {
    if (el.dataset[lang]) {
      el.innerText = el.dataset[lang];
    }
  });
}

function prepareSummary(latest, districtName_EN, districtName_HI) {
  summaryText = {
    en: `Summary for ${districtName_EN}.
         Latest data from ${latest.month}, ${latest.fin_year}.
         Total households employed: ${latest.total_households_worked}.
         Average days of employment per household: ${latest.avg_days_employment}.
         Percentage of payments made on time: ${latest.pc_payments_on_time} percent.
         Households that completed 100 days: ${latest.total_hhs_completed_100_days}.`,
    hi: `जिला ${districtName_HI} के लिए सारांश।
         ${latest.month}, ${latest.fin_year} का नवीनतम डेटा।
         कुल नियोजित परिवार: ${latest.total_households_worked}.
         प्रति परिवार औसत रोजगार दिवस: ${latest.avg_days_employment}.
         समय पर किए गए भुगतान का प्रतिशत: ${latest.pc_payments_on_time} प्रतिशत।
         100 दिन पूरे करने वाले परिवार: ${latest.total_hhs_completed_100_days}.`,
  };
}

function speakSummary() {
  if (!summaryText[currentLang] || !window.speechSynthesis) {
    alert("Speech synthesis is not supported in your browser.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(summaryText[currentLang]);
  const voices = window.speechSynthesis.getVoices();
  let voice = voices.find((v) => v.lang.startsWith(currentLang));
  if (!voice) {
    voice = voices.find((v) => v.lang.startsWith("en"));
  }
  utterance.voice = voice;
  utterance.lang = currentLang;
  window.speechSynthesis.speak(utterance);
}

window.speechSynthesis.onvoiceschanged = () => {
  window.speechSynthesis.getVoices();
};

function autoDetectLocation() {
  if (navigator.geolocation) {
    geoStatus.innerText = "Detecting your location...";
    geoStatus.dataset.en = "Detecting your location...";
    geoStatus.dataset.hi = "आपका स्थान खोजा जा रहा है...";
    setLanguage(currentLang);

    navigator.geolocation.getCurrentPosition(onGeoSuccess, onGeoError);
  } else {
    geoStatus.innerText = "Location detection not supported by your browser.";
    geoStatus.dataset.en = "Location detection not supported by yourG browser.";
    geoStatus.dataset.hi =
      "आपका ब्राउज़र लोकेशन डिटेक्शन को सपोर्ट नहीं करता है।";
    setLanguage(currentLang);
  }
}

async function onGeoSuccess(position) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;

  try {
    const response = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
    if (!response.ok) {
      throw new Error("Geocoding failed");
    }

    const data = await response.json();

    const districtName = data.district;
    const option = districtSelect.querySelector(
      `option[value="${districtName}"]`
    );

    if (option) {
      geoStatus.innerText = `Location set to ${option.dataset.en}.`;
      geoStatus.dataset.en = `Location set to ${option.dataset.en}.`;
      geoStatus.dataset.hi = `स्थान ${option.dataset.hi} पर सेट किया गया।`;
      setLanguage(currentLang);

      option.selected = true;

      districtSelect.dispatchEvent(new Event("change"));
    } else {
      onGeoError();
    }
  } catch (error) {
    console.error("Geocoding fetch error:", error);
    onGeoError();
  }
}

function onGeoError() {
  geoStatus.innerText =
    "Could not detect location. Please select your district.";
  geoStatus.dataset.en =
    "Could not detect location. Please select your district.";
  geoStatus.dataset.hi = "स्थान का पता नहीं चल सका। कृपया अपना जिला चुनें।";
  setLanguage(currentLang);
}
