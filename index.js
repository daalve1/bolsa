const cheerio = require('cheerio'); // Añade esta línea al inicio de tu archivo, junto con los otros requires
const https = require('https'); // Necesario para hacer peticiones HTTPS con Node.js
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

// Deshabilitar los logs en producción
if (process.env.RAILWAY_ENVIRONMENT === 'production') {
    console.log = function() {};
}  

//
// CARGA DE SUSCRIPCIONES DESDE VARIABLE DE ENTORNO
//
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

//
// CONFIGURACIÓN DE EMPRESAS A SCRAPEAR
//
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
    { nombre: "PLATOALTO", url: "https://es.marketscreener.com/cotizacion/accion/PALO-ALTO-NETWORKS-INC-11067980/noticia/" },
    { nombre: "HELLOFRESH", url: "https://es.marketscreener.com/cotizacion/accion/HELLOFRESH-SE-38533857/noticia/" },
    { nombre: "ELF BEAUTY", url: "https://es.marketscreener.com/cotizacion/accion/ELF-BEAUTY-31370490/noticia/" },
    { nombre: "KERING", url: "https://es.marketscreener.com/cotizacion/accion/KERING-4683/noticia/" },
    { nombre: "BAYER", url: "https://es.marketscreener.com/cotizacion/accion/BAYER-AG-436063/noticia/" },
    { nombre: "PUMA", url: "https://es.marketscreener.com/cotizacion/accion/PUMA-SE-436505/noticia/" },
    { nombre: "DELL", url: "https://es.marketscreener.com/cotizacion/accion/DELL-TECHNOLOGIES-INC-50061235/noticia/" },
    { nombre: "UPS", url: "https://es.marketscreener.com/cotizacion/accion/UNITED-PARCEL-SERVICE-INC-14758/noticia/" },
];

//
// CONFIGURACIÓN DE LA BASE DE DATOS SQLITE
//
const db = new sqlite3.Database('./scraping.db', (err) => {
    if (err) {
        console.error('Error al abrir la base de datos:', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite');
    }
});

db.run(`
    CREATE TABLE IF NOT EXISTS scraped_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company TEXT,
        news TEXT,
        date TEXT
    );
`);

//
// FUNCIÓN PARA VALIDAR FECHA (DD/MM) – Máximo de N días (configurable)
//
function isWithinNDays(dateStr, nDays) { // Ahora acepta nDays como argumento
    const ddmmRegex = /^\d{2}\/\d{2}$/;
    if (!ddmmRegex.test(dateStr)) return true; // Si no tiene ese formato, se considera válida

    const [dayStr, monthStr] = dateStr.split('/');
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);

    const now = new Date();
    let year = now.getFullYear();

    // Si el mes indicado es mayor que el mes actual, se asume que la fecha corresponde al año anterior.
    if (month > (now.getMonth() + 1)) {
        year = year - 1;
    }

    const newsDate = new Date(year, month - 1, day);
    // Se define el límite como N días atrás desde hoy.
    const nDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - nDays); // Usa nDays

    return newsDate >= nDaysAgo;
}

//
// FUNCIÓN DE SCRAPING
//
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
                for (let i = 0; i < rows.length; i++) { // Cambiar a bucle for tradicional para poder usar 'break'
                    const row = rows[i];
                    const cols = $(row).find('td');
                    if (cols.length >= 2) {
                        const anchor = $(cols[0]).find('a');
                        let news = "";
                        let newsUrl = "";
                        if (anchor.length > 0) {
                            news = anchor.text().trim();
                            newsUrl = anchor.attr('href');
                            if (newsUrl && !newsUrl.startsWith('http')) { // Asegurar URL absoluta si es relativa
                                newsUrl = new URL(newsUrl, url).href;
                            }
                        } else {
                            news = $(cols[0]).text().trim();
                        }
                        const date = $(cols[1]).text().trim();

                        if (news) {
                            if (isWithinNDays(date, 1)) { // Comprobar si la noticia es de máximo 1 día de antigüedad (LIMITE DE 1 DÍA)
                                newsData.push({ news, date, url: newsUrl });
                            } else {
                                console.log(`Noticia con fecha de más de 1 día detectada. Deteniendo procesamiento para URL: ${url}. (Fecha: ${date})`);
                                break; // <---- ¡¡¡DETENER PROCESAMIENTO DE NOTICIAS PARA ESTA EMPRESA!!!
                            }
                        }
                    }
                }
                resolve(newsData);
            });
        }).on('error', (error) => {
            console.error(`Error en ${url}:`, error);
            reject(null); // Rechazar la promesa en caso de error
        });
    });
}

//
// FUNCIONES DE BASE DE DATOS
//
function checkIfExists(news) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM scraped_data WHERE news = ?', [news], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function saveToDatabase(company, newsItem) {
    return new Promise((resolve, reject) => {
        const { news, date } = newsItem;
        db.run(
            'INSERT INTO scraped_data (company, news, date) VALUES (?, ?, ?)',
            [company, news, date],
            function (err) {
                if (err) {
                    reject(err);
                } else {
                    console.log(`Datos insertados para "${company}" - ID: ${this.lastID}`);
                    resolve(this.lastID);
                }
            }
        );
    });
}

//
// FUNCIÓN PARA ENVIAR EMAIL CON VISTA PREVIA (HTML)
//
async function sendEmail(recipient, newsItems) {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    // Construir el contenido HTML del correo
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
        // Solo se muestran los primeros 3 caracteres del email para seguridad
        const emailPreview = recipient.slice(0, 3);
        console.log(`Correo enviado correctamente a: ${emailPreview}...`);
    } catch (error) {
        console.error(`Error enviando email a ${recipient.slice(0, 3)}...:`, error);
    }
}

//
// FUNCIÓN PRINCIPAL
//
async function ejecutarTarea() {
    console.log("⏳ Iniciando scraping...");
    for (const subscription of subscriptions) {
        console.log(`\nProcesando suscripción para: ${subscription.email.slice(0, 3)}...`);
        let newNews = [];

        for (const companyName of subscription.companies) {
            const empresa = empresas.find(e => e.nombre === companyName);
            if (!empresa) {
                console.warn(`La empresa ${companyName} no se encontró en la configuración.`);
                continue;
            }
            console.log(`🔍 Scrapeando: ${empresa.nombre}`);
            const scrapedNews = await scrapeWebsite(empresa.url);
            if (scrapedNews && scrapedNews.length > 0) {
                for (const newsItem of scrapedNews) {
                    try {
                        const exists = await checkIfExists(newsItem.news);
                        if (!exists) {
                            await saveToDatabase(empresa.nombre, newsItem);
                            newNews.push({ ...newsItem, company: empresa.nombre });
                        } else {
                            console.log(`Noticia ya registrada: ${newsItem.news}`);
                        }
                    } catch (error) {
                        console.error('Error procesando noticia:', error);
                    }
                }
            }
        }

        if (newNews.length > 0) {
            await sendEmail(subscription.email, newNews);
        } else {
            console.log(`No hay noticias nuevas para enviar a ${subscription.email.slice(0, 3)}...`);
        }
    }
    console.log("✅ Scraping completado.");
}

// Ejecutar la tarea cada 5 minutos
setInterval(ejecutarTarea, 5 * 60 * 1000);
