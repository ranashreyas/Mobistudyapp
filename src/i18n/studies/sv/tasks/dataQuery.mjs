'use strict'

export default {
  title: 'Data begäran',
  shortDescription: 'Ber din telefon om aktivitetsdata',
  shortTitle: 'Data begäran',
  OSpermissioniOS: 'This task requires the app to access part of the data collected by HealthKit on your phone.\n These data are needed by the research team for analysis. Tap on Next if you want to proceed with the authorization process.',
  OSpermissionAndroid: 'This task requires the app to access part of the data collected by Google Fit on your phone.\n These data are needed by the research team for analysis. Tap on Next if you want to proceed with the authorization process.',
  instructionSlidesAndroid: [
    {
      title: 'Introduktion',
      img: 'instructions/data_query_android_1.png',
      description: 'I den här uppgiften kommer appen hämta data från Google Fit om du har det intallerat på din mobil.'
    },
    {
      img: 'instructions/data_query_2.png',
      description: 'Mobistudy appen kommer endast att hämta data som är efterfrågad av den här studien. En sammanfattning av datan kommer visas i form av diagram. Efter att du har granskat informationen så kan skicka informationen eller välja att radera den.'
    }
  ],
  instructionSlidesiOS: [
    {
      title: 'Introduktion',
      img: 'instructions/data_query_ios_1.png',
      description: 'I den här uppgiften kommer appen att hämta data som har samlats av Health appen.'
    },
    {
      img: 'instructions/data_query_2.png',
      description: 'Mobistudy appen kommer endast att hämta data som är efterfrågad av den här studien. En sammanfattning av datan kommer visas i form av diagram. Efter att du har granskat informationen så kan skicka informationen eller välja att radera den.'
    }
  ],
  dataQueryExplanation: 'Det här är en sammanfattning av den datan som har hämtats från din mobil. Skicka iväg informationen eller radera den.'
}
