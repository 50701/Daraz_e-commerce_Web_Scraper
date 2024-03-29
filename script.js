const puppeteer = require('puppeteer');

//callback and sync APIs
const fs = require('fs');

//promise-based APIs
const fsp = require('fs/promises');

const axios = require('axios');
const {stringify} = require('csv-stringify');
require('dotenv').config();


//Main Scraping Function
async function start(){
    try{
        const browser = await puppeteer.launch({ headless : false, defaultViewport : false });
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(0);

        //Paste your Shop Link here [all products]
        await page.goto("https://www.daraz.com.bd/glamygirl/?q=All-Products&langFlag=en&from=wangpu&lang=en&pageTypeId=2", {waitUntil : "load"});
        
        //Go to Specific Page Number and Start Grabbing from there
        let pagiNum = null; /* null | specify pagination page number */
        let pagination_available = await page.$(".ant-pagination-disabled.ant-pagination-next");
        
        if( pagiNum != null && pagination_available == null ){
            while( pagiNum != 0 ){
                await page.click(".ant-pagination-next");
                await page.reload({waitUntil : "load"});
                pagiNum--;
            }
        }

        
        //Global Variables
        let allData = [];
        let unqNum = Date.now();
        let count = 0;

        
        //Create Image Directory
        var dir = `./images/products-${unqNum}/`;
        
        try{
            await fsp.stat(dir);
        }
        catch(err){
            //console.log(err);
            await fsp.mkdir(dir, { recursive: true });
        }
        
        
        //CSV Header
        let csvHeader = [
            "Name", "Sale price", "Regular price", "Categories", "Images", "Description", "Published", "In stock?", "Allow customer reviews?"
        ];

        //Create CSV file
        let csvFile = `./csv-files/products-${unqNum}.csv`;
        await fsp.writeFile(csvFile, csvHeader.join() + "\n");

        async function get_all_info( startFrom = null ){
            try{
                //Product Links
                await page.waitForSelector(".gridItem--Yd0sa", {timeout : 0});
                let product_links = await page.evaluate( () => {
                        const links = document.querySelectorAll(".mainPic--ehOdr a");
                        return Array.from(links, (a) => a.href);
                    } 
                );
                
                //console.log(product_links.length);

                //Start Grabbing From
                /* specify the num from where you want to start grabbing your products */
                if( startFrom != null && product_links.length >= startFrom ){
                    product_links = product_links.slice(startFrom - 1);
                }
                
                /* ===== For Testing Purpose Only ===== */
                //product_links = ["https://www.daraz.com.bd/products/kieslect-l11-mart-watch-pink-i240649860-s1183912148.html?spm=a2a0e.seller.list.76.5f2d561354whVK&mp=1"];
                
                //Get Product Info
                for (item of product_links) {
                    const page2 = await browser.newPage();
                    await page2.goto(item, {waitUntil : "networkidle0", timeout: 0});
                    await page2.bringToFront();

                    //Scroll to Description Section 
                    let scrollToDes = await page2.$(".pdp-block__product-description");
                    if(scrollToDes != null){
                        await page2.evaluate(() => {
                            document.querySelector(".pdp-block__product-description").scrollIntoView({behavior: "smooth", block: "start", inline: "nearest"});
                        });
                    }
                    
                    
                    //Title
                    await page2.waitForSelector("span.pdp-mod-product-badge-title", {timeout : 0});
                    let title = await page2.$eval("span.pdp-mod-product-badge-title", (productTitle) => {
                        return productTitle.textContent;
                    });


                    //Price
                    await page2.waitForSelector(".pdp-price", {timeout : 0});
                    let offerPrice = await page2.$eval(".pdp-price", (productPrice) => {
                        return productPrice.textContent.split(" ")[1];
                    });

                    let regularPrice_class = await page2.$(".pdp-price_type_deleted");
                    let regularPrice = "";
                    if(regularPrice_class != null){
                        regularPrice = await page2.$eval(".pdp-price_type_deleted", (el) => {
                            return el.textContent.split(" ")[1];
                        });
                    }
                    
                    let discount_class = await page2.$(".pdp-product-price__discount");
                    let discount = "";
                    if(discount_class != null){
                        discount = await page2.$eval(".pdp-product-price__discount", (el) => {
                            return el.textContent.split("-")[1];
                        });
                    }
                    

                    //Categories
                    await page2.waitForSelector(".breadcrumb_item_anchor > span", {timeout : 0});
                    let categories = await page2.$$eval(".breadcrumb_item_anchor > span", (productCategories) => {
                        return productCategories.map((item) => item.textContent);
                    });

                    categories = categories.toString().replace(/,/g, " > ");


                    //Create Images Sub Directory 
                    count++;
                    var imgSubDir = `./images/products-${unqNum}/${count}/`;
                        
                    try{
                        await fsp.stat(imgSubDir);
                    }
                    catch(err){
                        //console.log(err);
                        await fsp.mkdir(imgSubDir, { recursive: true });
                    }


                    //Images URL
                    await page2.waitForSelector(".item-gallery__image-wrapper img", {timeout : 0});
                    let images = await page2.$$eval(".item-gallery__image-wrapper img", (elements) => {
                        return elements.map((item) => item.src);
                    });

                    //Save Images Locally 
                    const savedImages = [];
                    for(let image of images){
                        const page3 = await browser.newPage();
                        const imageFile = await page3.goto(image, {waitUntil : "networkidle0", timeout: 0});
                        await page3.bringToFront();

                        let val = await processImgFileName(image, title);

                        let filePath = imgSubDir;
                        const fileName = `${val.imageTitle}-${Date.now()}.${val.imageExtension}`;
                        await fsp.writeFile(`${filePath}${fileName}`, await imageFile.buffer());

                        if(process.env.IMAGE_LOCATION){
                            if(process.env.IMAGE_LOCATION.charAt(process.env.IMAGE_LOCATION.length - 1) != "/"){
                                filePath = process.env.IMAGE_LOCATION + "/" + `products-${unqNum}/${count}/`;
                            }else{
                                filePath = process.env.IMAGE_LOCATION + `products-${unqNum}/${count}/`;
                            }
                        }

                        await savedImages.push(`${filePath}${fileName}`);
                        await page3.close();
                    }

                    //console.log(savedImages);

                    /* axios({
                        method: 'get',
                        url: 'http://localhost/wordpress/wp-json/wp/v2/media',
                    })
                    .then(function (response) {
                        console.log(response);
                    }); */
                    

                    //Product SubHeadings
                    let productDetails_heading = "";
                    let specifications_heading = "";
                    let product_subHeading_class = await page2.$(".pdp-mod-section-title");
                    if(product_subHeading_class != null){
                        await page2.waitForSelector(".pdp-mod-section-title", {timeout : 0});
                        let subHeadings = await page2.$$eval(".pdp-mod-section-title", (productSubheadings) => {
                            return productSubheadings.map((item) => item.textContent);
                        });

                        //Product Details Heading
                        productDetails_heading = subHeadings[0];

                        //Specifications Heading
                        specifications_heading = subHeadings[1];
                    }
                    


                    


                    //Product Highlights
                    let description = "";
                    let product_highlights_class = await page2.$(".pdp-product-highlights");
                    if(product_highlights_class != null){
                        await page2.waitForSelector(".pdp-product-highlights", {timeout : 0});
                        description = await page2.$eval(".pdp-product-highlights", (productHighlights) => {
                            return productHighlights.innerHTML;
                        });
                    }
                    

                    
                    //Detail Content
                    let htmlContent = "";
                    let htmlContent_class = await page2.$(".html-content.detail-content");
                    if(htmlContent_class != null){
                        await page2.waitForSelector(".html-content.detail-content", {timeout : 0});
                        htmlContent = await page2.evaluate(() => {
                            return document.querySelector(".html-content.detail-content").outerHTML;
                        });

                        htmlContent = htmlContent.replace(/style=".+?"/gi, "");

                        /* Images used in Description */
                        let desImages = [];
                        let class_exist = await page2.$(".html-content.detail-content img");
                        if(class_exist != null){
                            desImages = await page2.$$eval(".html-content.detail-content img", (elements) => {
                                return elements.map((item) => item.src);
                            });

                            for(let image of desImages){
                                const page3 = await browser.newPage();
                                const imageFile = await page3.goto(image, {waitUntil : "networkidle0", timeout: 0});
                                await page3.bringToFront();
                                //await page3.waitForNavigation();
                                
                                let val = await processImgFileName(image, title);
                                
                                let filePath = imgSubDir;
                                const fileName = `${val.imageTitle}-${Date.now()}.${val.imageExtension}`;
                                await fsp.writeFile(`${filePath}${fileName}`, await imageFile.buffer());

                                if(process.env.IMAGE_LOCATION){
                                    if(process.env.IMAGE_LOCATION.charAt(process.env.IMAGE_LOCATION.length - 1) != "/"){
                                        filePath = process.env.IMAGE_LOCATION + "/" + `products-${unqNum}/${count}/`;
                                    }else{
                                        filePath = process.env.IMAGE_LOCATION + `products-${unqNum}/${count}/`;
                                    }
                                }

                                htmlContent = htmlContent.replace(image, `${filePath}${fileName}`);

                                await page3.close();
                            }
                        }

                        //console.log(htmlContent);
                    }
                    
                    
                    //Specifications
                    let specifications = "";
                    let specification_class = await page2.$(".pdp-general-features");
                    if(specification_class != null){
                        await page2.waitForSelector(".pdp-general-features", {timeout : 0});
                        specifications = await page2.$eval(".pdp-general-features", (el) => {
                            return el.innerHTML;
                        });
                    }
                    


                    //Box Content
                    let boxContent = "";
                    let boxContent_class = await page2.$(".box-content");
                    if(boxContent_class != null){
                        await page2.waitForSelector(".box-content", {timeout : 0});
                        boxContent = await page2.$eval(".box-content", (el) => {
                            return el.outerHTML;
                        });
                    }
                    

                    //Aggregate Product's Description
                    let product_Description = 
                        "<div class=\"drz_description\">" + 
                            "<h2 class=\"productDetails_heading\">"  + productDetails_heading + "</h2>" + 
                            "<div class=\"description\">" + description + "</div>" + 
                            "<div class=\"htmlContent\">" + htmlContent + "</div>" + 
                            "<h2 class=\"specifications_heading\">"  + specifications_heading + "</h2>" + 
                            "<div class=\"specifications\">" + specifications + "</div>" + 
                            "<div class=\"boxContent\">" + boxContent + "</div>" + 
                        "</div>";

                    let productInfo = {
                        "name" : title,
                        "sale_price" : offerPrice,
                        "regular_price" : regularPrice,
                        "categories" : categories,
                        "images" : savedImages.join(),
                        "description" : product_Description,
                        "status" : -1,
                        "stock_status" : 0,
                        "reviews_allowed" : 1,
                    };

                    //console.log(productInfo);

                    //allData.push(productInfo);

                    //Insert Data to CSV file
                    await stringify([productInfo], 
                        {
                            header : false,
                            columns: { 
                                'name': 'Name', 
                                'sale_price': 'Sale price', 
                                'regular_price': 'Regular price', 
                                'categories': 'Categories', 
                                'images': 'Images', 
                                'description': 'Description', 
                                'status': 'Published', 
                                'stock_status': 'In stock?', 
                                'reviews_allowed': 'Allow customer reviews?',
                            }
                        }, 
                        (err, output) => {
                            if(err) {
                                console.log(err);
                            }else{
                                fsp.appendFile(csvFile, output);
                            }
                        }
                    );
                    
                    console.log("→ " + (count));

                    await page2.close();
                }

                //console.log(allData);
            }
            catch(err){
                console.log(err);
            }
        }

        //Get All Info
        await get_all_info();

        //Pagination
        await page.reload({waitUntil : "load"});
        let pagination_disabled = await page.$(".ant-pagination-disabled.ant-pagination-next");
        
        while(pagination_disabled == null){
            await page.click(".ant-pagination-next");
            //await page.waitForTimeout(3000);
            //await page.waitForSelector(".gridItem--Yd0sa", {timeout : 0});
            await page.reload({waitUntil : "load"});
            await get_all_info();
            pagination_disabled = await page.$(".ant-pagination-disabled.ant-pagination-next");
        }
        

        //Close Browser
        if(pagination_disabled != null){
            await browser.close();
        }

    }
    catch(err){
        console.log(err);
    }

}


//Process Image FileName
async function processImgFileName(image, title){
    //const imageName = await image.split("/").pop();
    //let imageExtension = await imageName.split(".").pop();

    let imageExtension = await image.match(/\.(gif|jpe?g|tiff?|png|webp|bmp|svg)/gi);
    await imageExtension == null ? imageExtension = "jpg" : imageExtension = imageExtension.pop().split(".").pop();

    let imageTitle = await title.replace(/[`~!@#$%^&*()_|+\-=?;:'",.<>\{\}\[\]\\\/\s]/gi, '-');

    //Characters Limit
    if(imageTitle.length > 180){
        imageTitle = await imageTitle.substring(0, 179);
    }

    return await {imageTitle, imageExtension};
}



//Start Scraping
start();
