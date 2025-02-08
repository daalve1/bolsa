const { chromium } = require('playwright');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

//
// CARGA DE SUSCRIPCIONES DESDE VARIABLE DE ENTORNO
//
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
// FUNCIÓN PARA VALIDAR FECHA (DD/MM) – Máximo de 2 días
//
function isWithinTwoDays(dateStr) {
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
    // Se define el límite como dos días atrás desde hoy.
    const twoDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
    
    return newsDate >= twoDaysAgo;
}

//
// FUNCIÓN DE SCRAPING
//
async function scrapeWebsite(url, company) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });

        const data = await page.evaluate(() => {
            const rows = document.querySelectorAll('#newsScreener tr');
            const newsData = [];
            rows.forEach(row => {
                const cols = row.querySelectorAll('td');
                if (cols.length >= 2) {
                    const news = cols[0]?.innerText.trim();
                    const date = cols[1]?.innerText.trim();
                    if (news) {
                        newsData.push({ news, date });
                    }
                }
            });
            return newsData;
        });

        await browser.close();
        return data;
    } catch (error) {
        console.error(`Error en ${url}:`, error);
        await browser.close();
        return null;
    }
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
// FUNCIÓN PARA ENVIAR EMAIL CON VISTA PREVIA DE LAS PRIMERAS 3 LÍNEAS
//
async function sendEmail(recipient, newsItems) {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    // Construir el contenido del correo
    let emailText = newsItems
        .map(item => `Empresa: ${item.company}\nNoticia: ${item.news}\nFecha: ${item.date}`)
        .join('\n\n');
    
    let mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipient,
        subject: `Nuevas noticias extraídas`,
        text: emailText
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        
        // Mostrar las tres primeras letras del email en los logs
        const emailPreview = recipient.slice(0, 3); // Toma las tres primeras letras del correo
        console.log(`Correo enviado correctamente a: ${emailPreview}...`);

    } catch (error) {
        console.error(`Error enviando email a destinatario:`, error);
    }
}

//
// FUNCIÓN PRINCIPAL
//
async function ejecutarTarea() {
    console.log("⏳ Iniciando scraping...");
    let newNews = [];  // Noticias nuevas (con la empresa asociada)

    for (let empresa of empresas) {
        console.log(`🔍 Scrapeando: ${empresa.nombre}`);
        const scrapedNews = await scrapeWebsite(empresa.url, empresa.nombre);
        if (scrapedNews && scrapedNews.length > 0) {
            for (const newsItem of scrapedNews) {
                const ddmmRegex = /^\d{2}\/\d{2}$/;
                if (ddmmRegex.test(newsItem.date)) {
                    if (!isWithinTwoDays(newsItem.date)) {
                        console.log(`Se descarta noticia por fecha antigua: "${newsItem.news}" (Fecha: ${newsItem.date})`);
                        continue;
                    }
                }
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

    // Enviar correo a cada suscriptor con las noticias de las empresas a las que están suscritos.
    if (newNews.length > 0) {
        for (const subscription of subscriptions) {
            const filteredNews = newNews.filter(item => subscription.companies.includes(item.company));
            if (filteredNews.length > 0) {
                await sendEmail(subscription.email, filteredNews);
            } else {
                console.log(`No hay noticias nuevas para enviar a destinatario.`);
            }
        }
    } else {
        console.log("✅ No hay noticias nuevas para enviar a ningún destinatario.");
    }
    
    console.log("✅ Scraping completado.");
}

// Programar la tarea para que se repita cada 5 minutos (5 * 60 * 1000 milisegundos)
setInterval(ejecutarTarea, 5 * 60 * 1000);