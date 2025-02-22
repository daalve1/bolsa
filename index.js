const cheerio = require('cheerio');
const https = require('https');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

if (process.env.RAILWAY_ENVIRONMENT === 'production') {
    console.debug = function() {};
}

let subscriptions;
try {
    const rawSubscriptions = process.env.SUBSCRIPTIONS;
    if (!rawSubscriptions) {
        throw new Error("La variable SUBSCRIPTIONS está vacía o no está definida.");
    }
    subscriptions = JSON.parse(rawSubscriptions);
} catch (error) {
    console.error("❌ Error al parsear la variable de entorno SUBSCRIPTIONS:", error.message);
    process.exit(1);
}

const empresas = [
    { nombre: "HENSOLDT", url: "https://es.marketscreener.com/cotizacion/accion/HENSOLDT-AG-112902521/noticia/" },
    { nombre: "DEXCOM", url: "https://es.marketscreener.com/cotizacion/accion/DEXCOM-INC-9115/noticia/" },
    { nombre: "PAYPAL", url: "https://es.marketscreener.com/cotizacion/accion/PAYPAL-HOLDINGS-INC-23377703/noticia/" },
    { nombre: "MICROSOFT", url: "https://es.marketscreener.com/cotizacion/accion/MICROSOFT-CORPORATION-4835/noticia/" },
    { nombre: "ADOBE", url: "https://es.marketscreener.com/cotizacion/accion/ADOBE-INC-4844/noticia/" },
    { nombre: "PEPSI", url: "https://es.marketscreener.com/cotizacion/accion/PEPSICO-INC-39085159/noticia/" },
    { nombre: "NOVONORDISK", url: "https://es.marketscreener.com/cotizacion/accion/NOVO-NORDISK-A-S-1412980/noticia/" },
    { nombre: "INDITEX", url: "https://es.marketscreener.com/cotizacion/accion/INDITEX-16943135/" },
    { nombre: "NU", url: "https://es.marketscreener.com/cotizacion/accion/NU-HOLDINGS-LTD-130481391/noticia/" },
    { nombre: "HOEGH", url: "https://es.marketscreener.com/cotizacion/accion/HOEGH-AUTOLINERS-ASA-129888455/noticia/" },
    { nombre: "SOFTBANK", url: "https://es.marketscreener.com/cotizacion/accion/SOFTBANK-CORP-54039112/noticia/" },
    { nombre: "MICRON", url: "https://es.marketscreener.com/cotizacion/accion/MICRON-TECHNOLOGY-INC-13639/noticia/" },
    { nombre: "GLOBALSTAR", url: "https://es.marketscreener.com/cotizacion/accion/GLOBALSTAR-INC-16313081/noticia/" },
    { nombre: "MICROSTRATEGY", url: "https://es.marketscreener.com/cotizacion/accion/MICROSTRATEGY-INCORPORATE-10105/noticia/" },
    { nombre: "NVIDIA", url: "https://es.marketscreener.com/cotizacion/accion/NVIDIA-CORPORATION-57355629/noticia/" },
    { nombre: "GERRESHEIMER", url: "https://es.marketscreener.com/cotizacion/accion/GERRESHEIMER-AG-599546/noticia/" },
    { nombre: "PALOALTO", url: "https://es.marketscreener.com/cotizacion/accion/PALO-ALTO-NETWORKS-INC-11067980/noticia/" },
    { nombre: "HELLOFRESH", url: "https://es.marketscreener.com/cotizacion/accion/HELLOFRESH-SE-38533857/noticia/" },
    { nombre: "ELF BEAUTY", url: "https://es.marketscreener.com/cotizacion/accion/ELF-BEAUTY-31370490/noticia/" },
    { nombre: "KERING", url: "https://es.marketscreener.com/cotizacion/accion/KERING-4683/noticia/" },
    { nombre: "BAYER", url: "https://es.marketscreener.com/cotizacion/accion/BAYER-AG-436063/noticia/" },
    { nombre: "PUMA", url: "https://es.marketscreener.com/cotizacion/accion/PUMA-SE-436505/noticia/" },
    { nombre: "DELL", url: "https://es.marketscreener.com/cotizacion/accion/DELL-TECHNOLOGIES-INC-50061235/noticia/" },
    { nombre: "UPS", url: "https://es.marketscreener.com/cotizacion/accion/UNITED-PARCEL-SERVICE-INC-14758/noticia/" },
    { nombre: "TUI", url: "https://es.marketscreener.com/cotizacion/accion/TUI-AG-470539/noticia/" },
    { nombre: "JPMORGAN", url: "https://es.marketscreener.com/cotizacion/accion/JPMORGAN-CHASE-CO-37468997/noticia/" },
    { nombre: "DWAVEQUANTUM", url: "https://es.marketscreener.com/cotizacion/accion/D-WAVE-QUANTUM-INC-142129231/noticia/" },
    { nombre: "FRESHPET", url: "https://es.marketscreener.com/cotizacion/accion/FRESHPET-INC-18509105/noticia/" },
    { nombre: "UNITEDHEALTH", url: "https://es.marketscreener.com/cotizacion/accion/UNITEDHEALTH-GROUP-INC-14750/noticia/" },
];

const db = new sqlite3.Database('./scraping.db', (err) => {
    if (err) {
        console.error('Error al abrir la base de datos:', err.message);
    } else {
        console.debug('Conectado a la base de datos SQLite');
    }
});

db.run(`
    CREATE TABLE IF NOT EXISTS scraped_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company TEXT,
        news TEXT,
        date TEXT,
        insertion_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`, (err) => {
    if (err) {
        console.error('Error al crear la tabla scraped_data:', err.message);
    } else {
        console.debug('Tabla scraped_data creada o ya existe.');
    }
});

db.run(`
    CREATE TABLE IF NOT EXISTS sent_news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        news_id INTEGER,
        email TEXT,
        sent_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (news_id) REFERENCES scraped_data(id)
    );
`, (err) => {
    if (err) {
        console.error('Error al crear la tabla sent_news:', err.message);
    } else {
        console.debug('Tabla sent_news creada o ya existe.');
    }
});

function isWithinNDays(dateStr, nDays) {
    const ddmmRegex = /^\d{2}\/\d{2}$/;
    if (!ddmmRegex.test(dateStr)) return true;

    const [dayStr, monthStr] = dateStr.split('/');
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);

    const now = new Date();
    let year = now.getFullYear();

    if (month > (now.getMonth() + 1)) {
        year = year - 1;
    }

    const newsDate = new Date(year, month - 1, day);
    const nDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - nDays);

    return newsDate >= nDaysAgo;
}

async function scrapeWebsite(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let html = '';
            res.on('data', (chunk) => {
                html += chunk;
            });
            res.on('end', () => {
                const $ = cheerio.load(html);
                const newsData = [];
                const rows = $('#newsScreener tr');
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const cols = $(row).find('td');
                    if (cols.length >= 2) {
                        const anchor = $(cols[0]).find('a');
                        let news = "";
                        let newsUrl = "";
                        if (anchor.length > 0) {
                            news = anchor.text().trim();
                            newsUrl = anchor.attr('href');
                            if (newsUrl && !newsUrl.startsWith('http')) {
                                newsUrl = new URL(newsUrl, url).href;
                            }
                        } else {
                            news = $(cols[0]).text().trim();
                        }
                        const date = $(cols[1]).text().trim();

                        if (news) {
                            if (isWithinNDays(date, 1)) {
                                newsData.push({ news, date, url: newsUrl });
                            } else {
                                console.debug(`Noticia con fecha de más de 1 día detectada. Deteniendo procesamiento para URL: ${url}. (Fecha: ${date})`);
                                break;
                            }
                        }
                    }
                }
                resolve(newsData);
            });
        }).on('error', (error) => {
            console.error(`Error en ${url}:`, error);
            reject(error);
        });
    });
}

function checkIfExists(news, email) {
    return new Promise((resolve, reject) => {
        const sqlQuery_checkIfExists = `
            SELECT sn.id FROM sent_news sn
            JOIN scraped_data sd ON sn.news_id = sd.id
            WHERE sd.news = ? AND sn.email = ?
        `;
        const params_checkIfExists = [news, email];

        db.get(sqlQuery_checkIfExists, params_checkIfExists, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function saveToDatabase(company, newsItem, email) {
    return new Promise((resolve, reject) => {
        const { news, date } = newsItem;
        const sqlQuery_saveToDatabase = `
            INSERT INTO scraped_data (company, news, date) VALUES (?, ?, ?)
        `;
        const params_saveToDatabase = [company, news, date];

        db.run(sqlQuery_saveToDatabase, params_saveToDatabase, function (err) {
            if (err) {
                console.error('Error al insertar en scraped_data:', err.message);
                reject(err);
            } else {
                console.debug(`Datos insertados para "${company}" - ID: ${this.lastID}`);
                const newsId = this.lastID;
                const sqlQuery_sentNews = `
                    INSERT INTO sent_news (news_id, email) VALUES (?, ?)
                `;
                const params_sentNews = [newsId, email];

                db.run(sqlQuery_sentNews, params_sentNews, function (err) {
                    if (err) {
                        console.error('Error al insertar en sent_news:', err.message);
                        reject(err);
                    } else {
                        resolve(newsId);
                    }
                });
            }
        });
    });
}

async function sendEmail(recipient, newsItems) {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    let emailHtml = newsItems
        .map(item => {
            const link = item.url ? `<a href="${item.url}">${item.news}</a>` : item.news;
            return `<p>
                                <strong>Empresa:</strong> ${item.company}<br>
                                <strong>Noticia:</strong> ${link}<br>
                                <strong>Fecha:</strong> ${item.date}
                            </p>`;
        })
        .join('');

    let mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipient,
        subject: `Nuevas noticias extraídas`,
        html: emailHtml
    };

    try {
        await transporter.sendMail(mailOptions);
        const emailPreview = recipient.slice(0, 3);
        console.debug(`Correo enviado correctamente a: ${emailPreview}...`);
    } catch (error) {
        console.error(`Error enviando email a ${recipient.slice(0, 3)}...:`, error);
    }
}

async function cleanupDatabase() {
    console.debug("🧹 Iniciando limpieza de base de datos...");
    return new Promise((resolve, reject) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 2);
        const cutoffTimestamp = cutoffDate.toISOString();

        db.run(`DELETE FROM scraped_data WHERE insertion_time < DATETIME(?)`, [cutoffTimestamp], function(err) {
            if (err) {
                console.error("❌ Error al limpiar la base de datos:", err.message);
                reject(err);
            } else {
                console.debug(`✅ Limpieza de base de datos completada. Registros eliminados: ${this.changes}`);
                resolve(this.changes);
            }
        });
    });
}

async function procesarNoticia(newsItem, empresa, subscription) {
    try {
        const exists = await checkIfExists(newsItem.news, subscription.email);
        if (!exists) {
            await saveToDatabase(empresa.nombre, newsItem, subscription.email);
            return { ...newsItem, company: empresa.nombre };
        } else {
            console.debug(`Noticia ya registrada para ${subscription.email.slice(0, 3)}: ${newsItem.news}`);
            return null;
        }
    } catch (error) {
        console.error('Error procesando noticia:', error);
        return null;
    }
}

async function ejecutarTarea() {
    console.time();
    console.debug("⏳ Iniciando scraping...");
    for (const subscription of subscriptions) {
        console.debug(`\nProcesando suscripción para: ${subscription.email.slice(0, 3)}...`);
        let newNews = [];

        await limitConcurrency(subscription.companies, 5, async (companyName) => {
            const empresa = empresas.find(e => e.nombre === companyName);
            if (!empresa) {
                console.warn(`La empresa ${companyName} no se encontró en la configuración.`);
                return;
            }
            console.debug(`🔍 Scrapeando: ${empresa.nombre}`);
            const scrapedNews = await scrapeWebsite(empresa.url);
            if (scrapedNews && scrapedNews.length > 0) {
                for (const newsItem of scrapedNews) {
                    const processedNews = await procesarNoticia(newsItem, empresa, subscription);
                    if (processedNews) {
                        newNews.push(processedNews);
                    }
                }
            } else {
                if (empresa) {
                    console.debug(`No se encontraron noticias o hubo un error al scrapear ${empresa.nombre}.`);
                }
            }
        });

        if (newNews.length > 0) {
            await sendEmail(subscription.email, newNews);
        } else {
            console.debug(`No hay noticias nuevas para enviar a ${subscription.email.slice(0, 3)}...`);
        }
    }
    console.debug("✅ Scraping completado.");
    console.timeEnd();
}

async function limitConcurrency(items, limit, asyncFn) {
    const results = [];
    const executing = [];
    for (const item of items) {
        const p = Promise.resolve().then(() => asyncFn(item));
        results.push(p);

        if (limit <= items.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(results);
}

// Ejecutar la tarea cada 5 minutos
setInterval(ejecutarTarea, 5 * 60 * 1000);

// Ejecutar la limpieza de la base de datos cada semana (cada 7 días aprox.)
setInterval(cleanupDatabase, 14 * 24 * 60 * 60 * 1000);