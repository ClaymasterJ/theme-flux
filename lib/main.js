'use babel';

import { CompositeDisposable } from 'atom';
import SolarCalc from 'solar-calc';

var http = require('http');
var https = require('https');
// const rp = require('request-promise');

function themeToConfigStringEnum({ metadata: { name } }) {
  return name;
  // return {
  //   value: name,
  //   description: getThemeTitle(name),
  // };
}

// Get list of themes
const loadedThemes = atom.themes.getLoadedThemes();
const enumThemeUI = loadedThemes
  .filter(theme => theme.metadata.theme === 'ui')
  .map(themeToConfigStringEnum);

const enumThemeSyntax = loadedThemes
  .filter(theme => theme.metadata.theme === 'syntax')
  .map(themeToConfigStringEnum);



export default {
  intervalId: null,

  dateLastSync: null,

  config: {
    themes: {
      type: "object",
      order: 1,
      properties: {
        dawn: {
          order: 1,
          type: 'object',
          properties: {
            enable: {
              order: 0,
              title: "Enable",
              type: "boolean",
              default: false,
            },
            ui: {
              order: 1,
              title: 'UI Theme',
              type: 'string',
              default: 'one-light-ui',
              enum: enumThemeUI,
            },
            syntax: {
              order: 2,
              title: 'Syntax Theme',
              type: 'string',
              default: 'one-light-syntax',
              enum: enumThemeSyntax,
            },
          },
        },
        day: {
          order: 2,
          type: 'object',
          properties: {
            ui: {
              order: 1,
              title: 'UI Theme',
              type: 'string',
              default: 'one-light-ui',
              enum: enumThemeUI,
            },
            syntax: {
              order: 2,
              title: 'Syntax Theme',
              type: 'string',
              default: 'one-light-syntax',
              enum: enumThemeSyntax,
            },
          },
        },
        dusk: {
          order: 3,
          type: 'object',
          properties: {
            enable: {
              order: 0,
              title: "Enable",
              type: "boolean",
              default: false,
            },
            ui: {
              order: 1,
              title: 'UI Theme',
              type: 'string',
              default: 'one-dark-ui',
              enum: enumThemeUI,
            },
            syntax: {
              order: 2,
              title: 'Syntax Theme',
              type: 'string',
              default: 'one-dark-syntax',
              enum: enumThemeSyntax,
            },
          },
        },
        night: {
          order: 4,
          type: 'object',
          properties: {
            ui: {
              order: 1,
              title: 'UI Theme',
              type: 'string',
              default: 'one-dark-ui',
              enum: enumThemeUI,
            },
            syntax: {
              order: 2,
              title: 'Syntax Theme',
              type: 'string',
              default: 'one-dark-syntax',
              enum: enumThemeSyntax,
            },
          },
        },
        autoUpdateConfig: {
          title: "Update Config on Theme Change",
          description: "Update this package's day or night theme configuration when you change it in Atom theme settings",
          type: "boolean",
          default: true
        }
      }
    },
    coordinates: {
      description: "Coordinates are used to deterimine the location of the sun",
      order: 2,
      type: 'object',
      properties: {
        useIP: {
          order: 0,
          title: 'Use IP',
          type: 'boolean',
          description: 'Use IP4 address for approximate location (may not work correctly when using a VPN). Otherwise, use manually specified latitude and longitude',
          default: true
        },
        latitude: {
          order: 1,
          title: 'Latitude',
          type: 'number',
          minmum: -90,
          maximum: 90,
          default: 33
        },
        longitude: {
          order: 2,
          title: 'Longitude',
          type: 'number',
          minmum: -180,
          maximum: 180,
          default: -84

        }
      }
    }
  },

  async activate() {
    this.checkUpdateTheme();

    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(atom.config.observe('core.themes', {}, async () => {
      if (atom.config.get('theme-fluxor.themes.autoUpdateConfig')) {
        let [coordinates_latitude, coordinates_longitude] = await this.getCoordinates();
        let [theme_ui, theme_syntax] = atom.config.get('core.themes');

        this.updateConfig(
          theme_ui,
          theme_syntax,
          this.getSunStatus(latitude = coordinates_latitude, longitude = coordinates_longitude)
        );
        // this.updateTheme(is_day);
      }
    }));

    // Regardless of autoUpdateConfig setting, when the user changes package
    //     config, update Atom theme
    if (true) {
      this.subscriptions.add(atom.config.observe('theme-fluxor', {}, async () => {
        setTimeout(async () => {
          let [coordinates_latitude, coordinates_longitude] = await this.getCoordinates();

          this.updateTheme(
            this.getSunStatus(latitude = coordinates_latitude, longitude = coordinates_longitude)
          );


        }, 0);


      }));
    }


    this.intervalId = setInterval(this.checkUpdateTheme.bind(this), this.getMillisecondsFromMinutes(15));
  },

  async checkUpdateTheme() {
    let [coordinates_latitude, coordinates_longitude] = await this.getCoordinates()

    this.updateTheme(this.getSunStatus(latitude = coordinates_latitude, longitude = coordinates_longitude));
  },

  deactivate() {
    this.subscriptions.dispose();

    clearInterval(this.intervalId);
    this.intervalId = null;
  },

  getHTTPPromise(options, option_json = false, option_https = false) {
    var get_module = option_https ? https : http

    return new Promise((resolve, reject) => {
      get_module.get(options, (resp) => {
        var body = ''
        resp.on('data', function(data) {
          body += data;
        });

        resp.on('end', function() {
          if (option_json) {
            body = JSON.parse(body);
          }
          resolve(body);
        });

        resp.on("error", err => {
          reject(err);
        });
      });
    });
  },

  async getCoordinates() {
    var coordinates_latitude = atom.config.get('theme-fluxor.coordinates.latitude');
    var coordinates_longitude = atom.config.get('theme-fluxor.coordinates.longitude');

    if (atom.config.get('theme-fluxor.coordinates.useIP')) {
      var promise_ip = this.getIPAddress();
      promise_ip.then(resp_ip => {
        var promise_location = this.getHTTPPromise({
          path: `/${resp_ip}/json/`,
          host: 'ipapi.co',
          port: 443,
          headers: { 'User-Agent': 'nodejs-ipapi-v1.02' }
        }, option_json = true, option_https = true);

        promise_location.then((resp) => {
          coordinates_latitude = resp["latitude"]
          coordinates_longitude = resp["longitude"]
        })
      })
      await promise_ip
    }

    return [coordinates_latitude, coordinates_longitude]
  },

  getIPAddress() {
    return this.getHTTPPromise({ 'host': 'api.ipify.org', 'port': 80, 'path': '/' });
  },

  updateConfig(theme_ui, theme_syntax, sun_status) {
    // console.log(`UPDATE CONFIG CALL for ${sun_status}`);
    // Update this package's configuration based on what is set in Atom theme

    switch (sun_status) {
      case "dawn":
      case "dusk":
        if (atom.config.get(`theme-fluxor.themes.${sun_status}.enable`)) {
          atom.config.set(`theme-fluxor.themes.${sun_status}.ui`, theme_ui);
          atom.config.set(`theme-fluxor.themes.${sun_status}.syntax`, theme_syntax);
        } else {
          if (sun_status == "dawn") {
            this.updateConfig(theme_ui, theme_syntax, "day")
          } else {
            this.updateConfig(theme_ui, theme_syntax, "night")
          }
        }
        break;
      case "day":
      case "night":
        atom.config.set(`theme-fluxor.themes.${sun_status}.ui`, theme_ui);
        atom.config.set(`theme-fluxor.themes.${sun_status}.syntax`, theme_syntax);
        break;
    }
  },

  updateTheme(sun_status) {
    // console.log(`UPDATE THEME CALL for ${sun_status}`);

    switch (sun_status) {
      case "dawn":
      case "dusk":
        if (atom.config.get(`theme-fluxor.themes.${sun_status}.enable`)) {
          atom.config.set(`theme-fluxor.themes.${sun_status}.ui`, theme_ui);
          atom.config.set(`theme-fluxor.themes.${sun_status}.syntax`, theme_syntax);
        } else {
          if (sun_status == "dawn") {
            this.updateTheme("day")
          } else {
            this.updateTheme("night")
          }
        }
        break;
      case "day":
      case "night":
        this.scheduleThemeUpdate([
          atom.config.get(`theme-fluxor.themes.${sun_status}.ui`),
          atom.config.get(`theme-fluxor.themes.${sun_status}.syntax`),
        ]);
        break;
    }
  },

  scheduleThemeUpdate(themes) {
    atom.config.set('core.themes', themes);
  },

  getSunStatus(latitude, longitude) {
    var date_now = new Date();

    var solar = new SolarCalc(
      date_now, latitude, longitude
    )

    switch (true) {
      case date_now < solar.nauticalDawn:
        return "night"
      case date_now < solar.sunrise:
        return "dawn"
      case date_now < solar.sunset:
        return "day"
      case date_now < solar.nauticalDusk:
        return "dusk"
      default:
        return "night"
    }
  },

  getCheckIntervalInMinutes() {
    return 15;
  },

  getMillisecondsFromMinutes(minutes) {
    return minutes * 60 * 1000;
  }
};
