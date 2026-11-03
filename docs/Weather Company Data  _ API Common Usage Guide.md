e 

| ![][image1] | Weather Company Data  \|  API Common Usage Guide     |
| :---- | ----- |

### **Overview**

This common usage and style guide describes the common elements, error handling, language support and terminology used by the Weather Company Data APIs. 

### **HTTP Headers**

The following HTTP headers should be set to the appropriate values: 

| Header | Documentation | Usage |
| ----- | ----- | ----- |
| Accept-Encoding: gzip | \*[http\://www\.w3.org/Protocols/rfc2616/rfc2616-sec14.html\#sec14.3](http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.3) | **REQUIRED**: All requests to the API’s should request that the response be compressed. Unless noted otherwise; the only supported encoding format is: **gzip** |

### **HTTPS Access**

All TWC APIs support HTTPS.  HTTPS is **required** to be used for all requests to the APIs.

### **Data Lifetime \- Caching and Expiration**

* Standard HTTP Cache-Control headers are used to define caching length. The TTL (Time To Live) value is provided in the HTTP Header as an absolute time value using the “max-age” directive.    
  Example:  “cache-control: max-age=599”.  
* The response may also provide a data element ‘expirationTimeUtc’ or ‘Expires’ which can be used to expire and remove a record from your system.

### **Cross-Origin Resource Sharing**

All TWC APIs support Cross-Origin Resource Sharing or CORS. For additional information on this communications mechanism, please refer to the following documents:

| Resource | Documentation |
| :---- | :---- |
| W3 CORS Specification | [http\://www\.w3.org/TR/cors/](http://www.w3.org/TR/cors/)  |
| CORS Tutorial | [http\://www\.html5rocks.com/en/tutorials/cors/](http://www.html5rocks.com/en/tutorials/cors/)  |

### **URL Path Components**

| URL Part | URL Part Type | Description |
| ----- | ----- | ----- |
| hostname | host | **api.weather.com** is the host for these API’s |
| version | Path Part | Current API version  (example:  "v3") |
| product  | Path Part | Product name (example: “observations/current”) |
| apiKey | Query Parameter |  Your API key for accessing the API |
| format | Query Parameter | The format of the response (“json”) |
| geocode | Query Parameter | For API’s which require a location for the data, the geocode is listed in order of latitude and longitude (ex. 34.53,-84.50) |
| language | Query Parameter | Language to return the response in (ex. en-US, es, es-MX, fr-FR) |
| units | Query Parameter | The unit of measure for the response. The following values are supported: e \= English units m \= Metric units h \= Hybrid units (UK) s  \= Metric SI units   |

### **HTTP Error Status Codes**

There are some differences in error status codes between v1 and v2/v3 APIs; the difference in HTTP status codes is noted in the table below for v1 APIs and v2/v3 APIs.

| v1 API \- HTTP Status Code | Description |
| :---: | :---- |
| 200 | OK. The request has succeeded. |
| 400 | Bad request. The request could not be understood by the server due to malformed syntax or there is no data found for the location requested. |
| 401 | Unauthorized. The request requires authentication. |
| 403 | Forbidden. The server understood the request but is refusing to fulfill it. |
| 404 | Not found. The endpoint requested is not found. |
| 500 | Internal server error. The server encountered an unexpected condition which prevented it from fulfilling the request. |
| **v2/v3 API \- HTTP Status Code** | **Description** |
| 204 | No Data Found for specific query. The 204 status code will have an empty response body. |
| 400 | Bad request. The request could not be understood by the server due to malformed syntax. This is implemented for all API’s. API will reject the request if any invalid parameters are supplied. |
| 401 | Unauthorized. The request requires authentication. |
| 403 | Forbidden. The server understood the request but the API key is not authorized to perform the requested operation. |
| 404 | Not found. The endpoint requested is not found. |
| 405 | Method Not Allowed. For example, sending a POST instead of a GET. |
| 406 | Not Acceptable. For example, not accepting gzip compressed responses. |
| 408 | Request Timeout. Client did not produce a request within the time server was willing to wait. |
| 500 | Internal server error. The server encountered an unexpected condition which prevented it from fulfilling the request. |
| 502-504 | Service Unavailable or Gateway issue. These error codes are returned if the service is temporarily unavailable. |

### **Standard Units of Measure**

Data attributes that respond to the ‘units’ parameter follow the pattern below for the different units of measure applied to the data.  The following applies to the majority of APIs.  Please refer to respective API documentation for possible deviations.

| Long Name | Imperial (English) \- e | Metric \- m | Metric SI \- s | Hybrid UK \- h |
| :---- | :---- | :---- | :---- | :---- |
|  Altitude |  ft (feet) |  m (meters) |  m (meters) |  ft (feet) |
| Temperature | f (fahrenheit) |  c (celsius) | c (celsius) | c (celsius)  |
| Pressure | hg (inches of mercury) | mb (millibars of mercury) | mb (millibars of mercury) | mb (millibars) |
| Precipitation Amount | in (inches) \- rain/snow | mm (millimeters \- rain),  cm (centimeters \- snow) | mm (millimeters \- rain),  cm (centimeters \- snow) | mm (millimeters \- rain),  cm (centimeters \- snow) |
| Distance | mi (miles) | km (kilometer) | m (meter) | mi (miles) |
| Visibility | mi (miles) | km (kilometer) | km (kilometer) | km (kilometer) |
| Wind Speed | mh (miles/hour)  | km (kilometer/hour) | m/s (meters per second) | mph (miles per hour) |
| Wave Height | ft (feet) | mtr (meter) |  | ft (feet) |

#### **Unit of Measure Conversion Tables** 

| Type | Imperial to Metric | Metric to Imperial |
| :---- | :---- | :---- |
| Temperature | Fahrenheit to Celsius:  Divide (F \- 32\) by 1.8 | Celsius to Fahrenheit: Multiply C by 1.8 and Add 32  |
| Pressure | Inches of Mercury to Millibars: Multiply Inches by 33.8637526  |  Millibars to Inches of Mercury : Multiply Millibars by 0.0295301 |
|  |  |  |
| Distance/Speed | **Imperial to Metric** | **Metric to Imperial** |
|  | Miles to Kilometers: Multiply Miles by 1.60934 | Kilometers to Miles : Multiply Kilometers by 0.6214 |
|  | Feet to Meters: Multiply Feet By 0.3048 | Meters to Feet: Multiply Meters By 3.2808 |
|  | Miles per Hour (MPH) to Meters Per Second: Multiply MPH  by 0.44704 | Meters Per Second(M/S) to Miles per Hour: Multiply M/S by 2.2369362920544 |
|  | Inches to Centimeters: Multiply Inches by 2.54 | Centimeters to Inches: Multiply Centimeters by 0.39370 |
|  | Inches to Millimeters: Multiply Inches by 25.4 | Millimeters to Inches: Multiply Centimeters by 0.0393701 |
|  |  | **Metric Conversions** |
|  |  | Kilometer per Hour (KPH) to Meters Per Second: Multiply KPH  by 0.277778 Meters Per Second  (M/S)to Kilometer per Hour: Multiply M/S by 3.6 |

#### 

### 

### **Postal Code and Postal Key Support**

Some APIs support requests by postal code. There is limited postal code support for v1 APIs. If a v1 API is noted with postal code support; the following countries postal codes are supported.  Further, v3 APIs support requests by postal KEY.  Postal Key will always be represented in a query in the camelCase format of ‘postalKey’ and will be formatted as **‘postalCode:countryCode’,** i.e.: **‘postalKey=81657:US’.**  

Supported countries for v1 postal codes are listed below:

| United States Country Code: US | United Kingdom Country Code: GB | France Country Code: FR | Germany Country Code: DE | Italy Country Code: IT |
| :---- | :---- | :---- | :---- | :---- |

Supported countries for v3 postalKeys are listed below:

| Andorra Country Code: AD | Afghanistan Country Code: AF  | Anguilla Country Code: AI | Albania Country Code: AL | Armenia Country Code: AM  Supports first 2 digits (out of 4\) | Argentina Country Code: AR Supports 5 alphanumeric character precision (out of 8\) | American Samoa Country Code: AS | Austria Country Code: AT |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Australia Country Code: AU | Azerbaijan Country Code: AZ Supports Regional (First 2 Digits) | Bosnia and Herzegovina Country Code: BA  | Bangladesh Country Code: BD Supports first 2 digits (out of 4\) | Belgium Country Code: BE | Bulgaria Country Code: BG  | Bahrain Country Code: BH  | Saint Barthélemy Country Code: BL |
| Bermuda Country Code: BM | Nation of Brunei Country Code: BN Supports first 2 characters (district level) | Brazil Country Code: BR | Bhutan Country Code: BT Supports first 2 digits | Belarus Country Code: BY | Canada Country Code: CA Support only the first 3 postal code characters (out of 6\) | Cocos Islands Country Code: CC | Switzerland Country Code: CH |
| Chile Country Code: CL Support regional codes \- first 3 characters (out of 7\) | People’s Republic of China Country Code: CN Supports first 4 digits | Colombia Country Code: CO Supports first 4 digits | Costa Rica Country Code: CR | Cape Verde Country Code: CV | Christmas Island Country Code: CX | Cyprus Country Code: CY | Czech Republic Country Code: CZ |
| Germany Country Code: DE | Denmark Country Code: DK | Dominican Republic Country Code: DO | Algeria Country Code: DZ | Ecuador Country Code: EC | Estonia Country Code: EE | Egypt Country Code: EG Support only the first 2 characters (out of 5\) | Spain Country Code: ES |
| Finland Country Code: FI | Federated States of Micronesia Country Code: FM | Faroe Islands Country Code: FO | France Country Code: FR | United Kingdom Country Code: GB Support Outward code and Sector ('XX X' or 'XXX X' or 'XXXX X') | Georgia Country Code: GE Supports first 2 digits | French Guiana Country Code: GF | Guernsey Country Code: GG |
| Ghana Country Code: GH Supports first 2 characters | Gibraltar Country Code: GI | Greenland Country Code: GL | Guadeloupe Country Code: GP | Greece Country Code: GR | South Georgia and the South Sandwich Islands Country Code: GS  | Guatemala Country Code: GT | Guam Country Code: GU |
| Guinea-Bissau Country Code: GW | Honduras Country Code: HN Supports first 2 digits | Croatia Country Code: HR | Haiti Country Code: HT | Hungary Country Code: HU | Indonesia Country Code: ID  | Ireland Country Code: IE Supports first 3 characters | Israel Country Code: IL Supports first 5 digits (out of 7\) |
| Isle of Man Country Code: IM Support Outward code and Sector ('XX X' or 'XXX X' or 'XXXX X') | India Country Code: IN | British Indian OOcean Territory Country Code: IO | Iraq Country Code: IQ Supports first 2 digits (out of 5\) | Iran Country Code: IR Supports first 2 digits (out of 5\) | Iceland Country Code: IS | Italy Country Code: IT | Jersey Country Code: JE Support Outward code and Sector ('XX X' or 'XXX X' or 'XXXX X') |
| Jordan Country Code: JO | Japan Country Code: JP | Kenya Country Code: KE Support only the first character (out of 6\) | Kyrgyzstan Country Code: KG Supports first 4 digits | Cambodia Country Code: KH Supports first 2 digits | South Korea Country Code: KR | Kuwait Country Code: KW Supports first 2 digits | Cayman Islands Country Code: KY |
| Kazakhstan Country Code: KZ Supports first 4 digits | Laos Country Code: LA Supports first 2 digits | Saint Lucia Country Code: LC | Liechtenstein Country Code: LI | Sri Lanka Country Code: LK Supports first 2 digits | Liberia Country Code: LR Supports first 2 digits | Lesotho Country Code: LS Supports first digit | Lithuania Country Code: LT |
| Luxembourg Country Code: LU | Latvia Country Code: LV | Morocco Country Code: MA | Monaco Country Code: MC | Moldova Country Code: MD | Montenegro Country Code: ME | Saint Martin Country Code: MF | Madagascar Country Code: MG |
| Marshall Islands Country Code: MH Supports first 3 digits (out of 5\) | The Republic of North Macedonia Country Code: MK | Myanmar Country Code: MM Supports first 2 digits | Mongolia Country Code: MN Supports first 4 digits | Northern Mariana Islands Country Code: MP | Martinique Country Code: MQ | Montserrat Country Code: MS | Malta Country Code: MT Support only first 3 characters (out of 7\) |
| Mauritius Country Code: MU Supports first 3 digits (out of 5\) | Maldives Country Code: MV Supports first 2 digits | Mexico Country Code: MX | Malaysia Country Code: MY  | Mozambique Country Code: MZ | New Caledonia Country Code: NC | Niger Country Code: NE | Norfolk Island Country Code: NF |
| Nigeria Country Code: NG Supports first 4 digits | Nicaragua Country Code: NI Supports first 3 digits | Netherlands Country Code: NL | Namibia Country Code: NM | Norway Country Code: NO | Nepal Country Code: NP Supports first 3 digits (out of 5\) | New Zealand Country Code: NZ | Oman Country Code: OM Supports first digit |
| Peru Country Code: PE | French Polynesia Country Code: PF | Papua New Guinea Country Code: PG | Philippines Country Code: PH | Pakistan Country Code: PK Supports first 2 digits | Poland Country Code: PL | Saint Pierre and Miquelon Country Code: PM | Puerto Rico Country Code: PR |
| Palestine Country Code: PS  | Portugal Country Code: PT | Palau Country Code: PW | Paraguay Country Code: PY Supports first digit | Réunion Country Code: RE | Romania Country Code: RO | Serbia Country Code: RS | Russia Country Code: RU Support first 4 characters (out of 6\) |
| Saudi Arabia Country Code: SA Supports first 2 digits | Sudan Country Code: SD Supports first 2 digits | Sweden Country Code: SE | Singapore Country Code: SG Supports first 2 characters (out of 6\) | Slovenia Country Code: SI | Svalbard and Jan Mayen Country Code: SJ | Slovakia Country Code: SK | San Marino Country Code: SM |
| Senegal Country Code: SN | South Sudan Country Code: SS | El Salvador Country Code: SV | Eswatini Country Code: SZ Supports first character | Turks and Caicos Islands Country Code: TC | Thailand Country Code: TH | Tajikistan Country Code: TJ Supports first 4 digits | Turkmenistan Country Code: TM Supports first 3 digits |
| Tunisia Country Code: TN | Turkey Country Code: TR | Trinidad and Tobago Country Code: TT Supports first 2 digits | Taiwan Country Code: TW Supports first 3 digits | Tanzania Country Code: TZ Supports first 3 characters (out of 5\) | Ukraine Country Code: UA  | United States Country Code: US | Uruguay Country Code: UY |
| Uzbekistan Country Code: UZ Supports first 4 digits | Vatican City Country Code: VA | Saint Vincent and the Grenadines Country Code: VC Supports first 4 characters | Venezuela Country Code: VE | British Virgin Islands Country Code: VG | United States Virgin Islands Country Code: VI | Vietnam Country Code: VN  | Wallis and Futuna Country Code: WF |
| Samoa Country Code: WS Supports first 3 characters (out of 6\) | Kosovo Country Code: XK Supports first 2 digits | Mayotte Country Code: YT | South Africa Country Code: ZA | Zambia Country Code: ZM |  |  |  |

### **Language Translations & Language Codes**

Some attributes support language translations. Any attribute that supports translated content will be noted as such in the ‘Translated Fields’ section of the API specific documentation. The ‘Translated Fields’ section denotes which fields respond to the valid ‘language’ parameter in the API request. Translated content will only be provided for valid supported languages as noted in the Language Code table.

| am-ET | Amharic \- (Ethiopia) |  | hi-IN | Hindi \- (India) |  | pt-BR | Portuguese \- (Brazil) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| ar-AE | Arabic \- (United Arab Emirates) |  | hr-HR | Croatian \- (Croatia) |  | pt-PT | Portuguese \- (Portugal) |
| az-AZ | Azerbaijani \- (Azerbaijan) |  | hu-HU | Hungarian \- (Hungary) |  | ro-RO | Romanian \- (Romania) |
| bg-BG | Bulgarian \- (Bulgaria) |  | id-ID | Indonesian \- (Indonesia) |  | ru-RU | Russian \- (Russia) |
| bn-BD | Bengali, Bangla \- (Bangladesh) |  | is-IS | Icelandic \- (Iceland) |  | si-LK | Sinhalese, Sinhala \- (Sri Lanka) |
| bn-IN | Bengali, Bangla \- (India) |  | it-IT | Italian \- (Italy) |  | sk-SK | Slovak \- (Slovakia) |
| bs-BA | Bosnian \- (Bosnia and Herzegovina) |  | iw-IL | Hebrew \- (Israel) |  | sl-SI | Slovenian \- (Slovenia) |
| ca-ES | Catalan \- (Spain) |  | ja-JP | Japanese \- (Japan) |  | sq-AL | Albanian \- (Albania) |
| cs-CZ | Czech \- (Czechia) |  | jv-ID | Javanese \- (Indonesia) |  | sr-BA | Serbian Latinica \- (Bosnia and Herzegovina) |
| da-DK | Danish \- (Denmark) |  | ka-GE | Georgian \- (Georgia) |  | sr-ME | Serbian Latinica \- (Montenegro) |
| de-DE | German \- (Germany) |  | kk-KZ | Kazakh \- (Kazakhstan) |  | sr-RS | Serbian Latinica \- (Serbia) |
| el-GR | Greek (modern) \- (Greece) |  | km-KH | Khmer \- (Cambodia) |  | sv-SE | Swedish \- (Sweden) |
| en-CA | English \- (Canada) |  | kn-IN | Kannada \- (India) |  | sw-KE | Swahili \- (Kenya) |
| en-GB | English \- (Great Britain) |  | ko-KR | Korean \- (South Korea) |  | ta-IN | Tamil \- (India) |
| en-IN | English \- (India) |  | lo-LA | Lao \- (Laos) |  | ta-LK | Tamil \- (Sri Lanka) |
| en-US | English \- (United States of America) |  | lt-LT | Lithuanian \- (Lithuania) |  | te-IN | Telugu \- (India) |
| en-AU | English \- (Australia) |  | lv-LV | Latvian \- (Latvia) |  | ti-ER | Tigrinya \- (Eritrea) |
| es-AR | Spanish \- (Argentina) |  | mk-MK | Macedonian \- (Macedonia) |  | ti-ET | Tigrinya \- (Ethiopia) |
| es-ES | Spanish \- (Spain) |  | mn-MN | Mongolian \- (Mongolia) |  | tg-TJ | Tajik \- (Tajikistan) |
| es-LA | Spanish \- (Latin America) |  | mr-IN | Marathi \- (India) |  | th-TH | Thai \- (Thailand) |
| es-MX | Spanish \- (Mexico) |  | ms-MY | Malay \- (Malaysia) |  | tk-TM | Turkmen \- (Turkmenistan) |
| es-UN | Spanish \- (International) |  | my-MM | Burmese \- (Myanmar) |  | tl-PH | Tagalog \- (Philippines) |
| es-US | Spanish \- (United States of America) |  | ne-IN | Nepali \- (India) |  | tr-TR | Turkish \- (Turkey) |
| et-EE | Estonian \- (Estonia) |  | ne-NP | Nepali \- (Nepal) |  | uk-UA | Ukrainian \- (Ukraine) |
| fa-IR | Persian (Farsi) \- (Iran) |  | nl-NL | Dutch \- (Netherlands) |  | ur-PK | Urdu \- (Pakistan) |
| fi-FI | Finnish \- (Finland) |  | no-NO | Norwegian \- (Norway) |  | uz-UZ | Uzbek \- (Uzbekistan) |
| fr-CA | French \- (Canada) |  | om-ET | Oromo \- (Ethiopia) |  | vi-VN | Vietnamese \- (Viet Nam) |
| fr-FR | French \- (France) |  | pa-IN | Punjabi \- (India) |  | zh-CN | Chinese \- (China) |
| gu-IN | Gujarati \- (India) |  | pa-PK | Punjabi \- (Pakistan) |  | zh-HK | Chinese \- (Hong Kong) |
| he-IL | Hebrew (modern) \- (Israel) |  | pl-PL | Polish \- (Poland) |  | zh-TW | Chinese \- (Taiwan) |

[image1]: <data:image/png;base64,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>