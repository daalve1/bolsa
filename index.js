const cheerio = require("cheerio");
const http = require("http"); // Servidor web para Railway
const nodemailer = require("nodemailer");
require("dotenv").config();

// Mantenemos los logs visibles comentando esto
if (process.env.RAILWAY_ENVIRONMENT === "production") {
  console.debug = function () {};
}

let subscriptions;
try {
  const rawSubscriptions = process.env.SUBSCRIPTIONS;
  if (!rawSubscriptions) {
    throw new Error("La variable SUBSCRIPTIONS está vacía o no está definida.");
  }
  subscriptions = JSON.parse(rawSubscriptions);
} catch (error) {
  console.error(
    "❌ Error al parsear la variable de entorno SUBSCRIPTIONS:",
    error.message,
  );
  process.exit(1);
}

const empresas = [
  {
    nombre: "HENSOLDT",
    url: "https://es.marketscreener.com/cotizacion/accion/HENSOLDT-AG-112902521/noticia/",
  },
  {
    nombre: "DEXCOM",
    url: "https://es.marketscreener.com/cotizacion/accion/DEXCOM-INC-9115/noticia/",
  },
  {
    nombre: "PAYPAL",
    url: "https://es.marketscreener.com/cotizacion/accion/PAYPAL-HOLDINGS-INC-23377703/noticia/",
  },
  {
    nombre: "MICROSOFT",
    url: "https://es.marketscreener.com/cotizacion/accion/MICROSOFT-CORPORATION-4835/noticia/",
  },
  {
    nombre: "ADOBE",
    url: "https://es.marketscreener.com/cotizacion/accion/ADOBE-INC-4844/noticia/",
  },
  {
    nombre: "PEPSI",
    url: "https://es.marketscreener.com/cotizacion/accion/PEPSICO-INC-39085159/noticia/",
  },
  {
    nombre: "NOVONORDISK",
    url: "https://es.marketscreener.com/cotizacion/accion/NOVO-NORDISK-A-S-1412980/noticia/",
  },
  {
    nombre: "INDITEX",
    url: "https://es.marketscreener.com/cotizacion/accion/INDITEX-16943135/",
  },
  {
    nombre: "NU",
    url: "https://es.marketscreener.com/cotizacion/accion/NU-HOLDINGS-LTD-130481391/noticia/",
  },
  {
    nombre: "HOEGH",
    url: "https://es.marketscreener.com/cotizacion/accion/HOEGH-AUTOLINERS-ASA-129888455/noticia/",
  },
  {
    nombre: "SOFTBANK",
    url: "https://es.marketscreener.com/cotizacion/accion/SOFTBANK-CORP-54039112/noticia/",
  },
  {
    nombre: "MICRON",
    url: "https://es.marketscreener.com/cotizacion/accion/MICRON-TECHNOLOGY-INC-13639/noticia/",
  },
  {
    nombre: "GLOBALSTAR",
    url: "https://es.marketscreener.com/cotizacion/accion/GLOBALSTAR-INC-16313081/noticia/",
  },
  {
    nombre: "MICROSTRATEGY",
    url: "https://es.marketscreener.com/cotizacion/accion/MICROSTRATEGY-INCORPORATE-10105/noticia/",
  },
  {
    nombre: "NVIDIA",
    url: "https://es.marketscreener.com/cotizacion/accion/NVIDIA-CORPORATION-57355629/noticia/",
  },
  {
    nombre: "GERRESHEIMER",
    url: "https://es.marketscreener.com/cotizacion/accion/GERRESHEIMER-AG-599546/noticia/",
  },
  {
    nombre: "PALOALTO",
    url: "https://es.marketscreener.com/cotizacion/accion/PALO-ALTO-NETWORKS-INC-11067980/noticia/",
  },
  {
    nombre: "HELLOFRESH",
    url: "https://es.marketscreener.com/cotizacion/accion/HELLOFRESH-SE-38533857/noticia/",
  },
  {
    nombre: "ELF BEAUTY",
    url: "https://es.marketscreener.com/cotizacion/accion/ELF-BEAUTY-31370490/noticia/",
  },
  {
    nombre: "KERING",
    url: "https://es.marketscreener.com/cotizacion/accion/KERING-4683/noticia/",
  },
  {
    nombre: "BAYER",
    url: "https://es.marketscreener.com/cotizacion/accion/BAYER-AG-436063/noticia/",
  },
  {
    nombre: "PUMA",
    url: "https://es.marketscreener.com/cotizacion/accion/PUMA-SE-436505/noticia/",
  },
  {
    nombre: "DELL",
    url: "https://es.marketscreener.com/cotizacion/accion/DELL-TECHNOLOGIES-INC-50061235/noticia/",
  },
  {
    nombre: "UPS",
    url: "https://es.marketscreener.com/cotizacion/accion/UNITED-PARCEL-SERVICE-INC-14758/noticia/",
  },
  {
    nombre: "TUI",
    url: "https://es.marketscreener.com/cotizacion/accion/TUI-AG-470539/noticia/",
  },
  {
    nombre: "JPMORGAN",
    url: "https://es.marketscreener.com/cotizacion/accion/JPMORGAN-CHASE-CO-37468997/noticia/",
  },
  {
    nombre: "DWAVEQUANTUM",
    url: "https://es.marketscreener.com/cotizacion/accion/D-WAVE-QUANTUM-INC-142129231/noticia/",
  },
  {
    nombre: "FRESHPET",
    url: "https://es.marketscreener.com/cotizacion/accion/FRESHPET-INC-18509105/noticia/",
  },
  {
    nombre: "UNITEDHEALTH",
    url: "https://es.marketscreener.com/cotizacion/accion/UNITEDHEALTH-GROUP-INC-14750/noticia/",
  },
  {
    nombre: "PRADA",
    url: "https://es.marketscreener.com/cotizacion/accion/PRADA-S-P-A-120793475/noticia/",
  },
  {
    nombre: "FERRARI",
    url: "https://es.marketscreener.com/cotizacion/accion/FERRARI-N-V-25531423/noticia/",
  },
];

// Comprueba si han pasado 6 minutos o menos
function esNoticiaReciente(horaStr, margenMinutos = 6) {
  const match = horaStr.match(/^(\d{2}):(\d{2})/);
  if (!match) return false;

  const horasNoticia = parseInt(match[1], 10);
  const minsNoticia = parseInt(match[2], 10);

  const ahoraMadrid = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }),
  );
  const horasAhora = ahoraMadrid.getHours();
  const minsAhora = ahoraMadrid.getMinutes();

  const totalMinsNoticia = horasNoticia * 60 + minsNoticia;
  const totalMinsAhora = horasAhora * 60 + minsAhora;

  let diferencia = totalMinsAhora - totalMinsNoticia;
  console.log("⏱️ Diferencia en minutos:", diferencia);
  if (diferencia < 0) {
    diferencia += 24 * 60;
  }

  return diferencia >= 0 && diferencia <= margenMinutos;
}

// Scraping con Headers y control de errores HTTP (403, etc)
async function scrapeWebsite(url) {
  try {
    // Usamos fetch con cabeceras extremas para imitar al 100% a Google Chrome
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Sec-Ch-Ua":
          '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
      },
    });

    // Si el servidor nos sigue bloqueando, lanzamos el error
    if (!response.ok) {
      throw new Error(`HTTP Status Code: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const newsData = [];
    const rows = $("#newsScreener tr");

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cols = $(row).find("td");

      if (cols.length >= 2) {
        const date = $(cols[0]).text().trim();

        const anchor = $(cols[1]).find("a");
        let news =
          anchor.length > 0 ? anchor.text().trim() : $(cols[1]).text().trim();
        let newsUrl = anchor.length > 0 ? anchor.attr("href") : "";

        if (newsUrl && !newsUrl.startsWith("http")) {
          newsUrl = new URL(newsUrl, url).href;
        }

        if (news) {
          if (/^\d{2}\/\d{2}$/.test(date)) {
            break;
          }

          if (esNoticiaReciente(date)) {
            newsData.push({ news, date, url: newsUrl });
          }
        }
      }
    }
    return newsData;
  } catch (error) {
    throw error;
  }
}

// Al no haber BBDD, procesamos directo
async function procesarNoticia(newsItem, empresa, subscription) {
  return { ...newsItem, company: empresa.nombre };
}

// Envío de correo
async function sendEmail(recipient, newsItems) {
  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  let emailHtml = newsItems
    .map((item) => {
      const link = item.url
        ? `<a href="${item.url}">${item.news}</a>`
        : item.news;
      return `<p>
                <strong>Empresa:</strong> ${item.company}<br>
                <strong>Noticia:</strong> ${link}<br>
                <strong>Fecha:</strong> ${item.date}
            </p>`;
    })
    .join("");

  let mailOptions = {
    from: process.env.EMAIL_USER,
    to: recipient,
    subject: `Nuevas noticias de bolsa extraídas`,
    html: emailHtml,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.debug(
      `📧 Correo enviado a ${recipient.slice(0, 3)}... con ${newsItems.length} noticias.`,
    );
  } catch (error) {
    console.error(`❌ Error enviando email a ${recipient.slice(0, 3)}:`, error);
  }
}

// Control de concurrencia
async function limitConcurrency(items, limit, asyncFn) {
  const results = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => asyncFn(item));
    results.push(p);

    const e = p.then(() => executing.splice(executing.indexOf(e), 1));
    executing.push(e);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

// Función principal
async function ejecutarTarea() {
  console.time("Tiempo de ejecucion");
  console.debug("⏳ Iniciando scraping...");

  for (const subscription of subscriptions) {
    console.debug(
      `\nProcesando suscripción para: ${subscription.email.slice(0, 3)}...`,
    );
    let newNews = [];

    await limitConcurrency(subscription.companies, 5, async (companyName) => {
      const empresa = empresas.find((e) => e.nombre === companyName);
      if (!empresa) return;

      console.debug(`🔍 Scrapeando: ${empresa.nombre}`);

      try {
        const scrapedNews = await scrapeWebsite(empresa.url);

        if (scrapedNews && scrapedNews.length > 0) {
          for (const newsItem of scrapedNews) {
            const processedNews = await procesarNoticia(
              newsItem,
              empresa,
              subscription,
            );
            if (processedNews) newNews.push(processedNews);
          }
        } else {
          console.debug(
            `ℹ️ No se encontraron noticias recientes para ${empresa.nombre}.`,
          );
        }
      } catch (error) {
        console.error(
          `❌ Bloqueo o Error al scrapear ${empresa.nombre}: ${error.message}`,
        );
      }
    });

    if (newNews.length > 0) {
      await sendEmail(subscription.email, newNews);
    } else {
      console.debug(
        `Sin noticias nuevas a enviar para ${subscription.email.slice(0, 3)}...`,
      );
    }
  }
  console.debug("✅ Scraping completado.");
  console.timeEnd("Tiempo de ejecucion");
}

// --- SERVIDOR WEB ---
const PORT = process.env.PORT || 8080;

const server = http.createServer(async (req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("✅ El bot está funcionando correctamente.");
  } else if (req.url === "/ejecutar") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("🚀 Iniciando scraping en segundo plano...");

    await ejecutarTarea();
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Ruta no encontrada");
  }
});

server.listen(PORT, () => {
  console.debug(`🌐 Servidor web escuchando en el puerto ${PORT}`);
  ejecutarTarea();
});
