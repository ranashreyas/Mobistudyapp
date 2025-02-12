<template>
  <q-page id="main">
    <div v-show="!isDownloading">
      <p class="q-pa-md">{{ $t('studies.tasks.miband3.chartsIntro') }}</p>
      <div class="text-center text-h6">
        {{ $t('studies.tasks.miband3.lineChart') }}
      </div>
      <div class="q-pa-md">
        <canvas
          style="margin: 0 auto; padding-right: 2rem;"
          height="320"
          ref="lineChart"
        />
        <div class="row justify-around">
          <q-btn
            :label="'-12 ' + $t('studies.tasks.miband3.hours')"
            color="secondary"
            :disable="disableMinus"
            @click="lineChartAdd((-12))"
          />
          <q-btn
            :label="'+12 ' + $t('studies.tasks.miband3.hours')"
            color="secondary"
            :disable="disablePlus"
            @click="lineChartAdd((12))"
          />
        </div>
      </div>
      <q-separator></q-separator>
      <div class="text-center text-h6">
        {{ $t('studies.tasks.miband3.pieChart') }}
      </div>
      <div class="q-pa-md">
        <canvas
          ref="pieChart"
          height="270"
        ></canvas>
      </div>
      <q-separator></q-separator>
      <div class="row justify-around q-my-lg">
        <q-btn
          color="secondary"
          :loading="isSending"
          :label="$t('common.discard')"
          @click="discard()"
        />
        <q-btn
          color="primary"
          :loading="isSending"
          :label="$t('common.send')"
          @click="send()"
        />
      </div>
    </div>

    <q-inner-loading :showing="isDownloading">
      <div class="text-overline">{{ $t('studies.tasks.miband3.dataDownload') }}</div>
      <q-spinner-dots
        size="50px"
        color="primary"
      />
    </q-inner-loading>
  </q-page>
</template>

<script>
/* eslint-disable no-new */
import miband3 from 'modules/miband3/miband3'
import Chart from 'chart.js'
import { getStringIdentifier } from 'modules/miband3/miband3ActivityTypeEnum.js'
import db from 'modules/db'
import userinfo from 'modules/userinfo'
import API from 'modules/API/API'
import moment from 'moment'

// a bunch of colors that nicely fit together on a multi-line or bar chart
// if there are more than 10 colors, we are in trouble
const chartColors = [
  '#800000',
  '#778000',
  '#118000',
  '#008080',
  '#003780',
  '#080080',
  '#440080',
  '#790080',
  '#800046',
  '#800046'
]

// holder of all the stored data, this is kept outside of Vue for efficiency
let storedData = []
let minimumDataRequired = 30 // 30 minutes of data is required at a minimum to upload the data

// pie chart configuration
let pieChartConfig = {
  type: 'doughnut',
  data: {
    labels: [],
    datasets: [{
      data: [],
      backgroundColor: []
    }]
  },
  options: {
    animation: {
      animateScale: true
    }
  },
  // additional properties used internally
  indexes: [],
  maxIndex: -1,
  reset () {
    this.data.datasets.data = []
    this.data.datasets.backgroundColor = []
    this.data.labels = []
    this.indexes = []
    this.maxIndex = -1
  }
}

// holder of the line chart data
var lineChart = {
  hrs: [],
  steps: [],
  intensities: [],
  labels: [],
  reset () {
    this.hrs = []
    this.steps = []
    this.intensities = []
    this.labels = []
  }
}

export default {
  name: 'MiBand3DataDownloadPage',
  props: {
    studyKey: String,
    taskId: Number
  },
  data () {
    return {
      startDate: new Date(),
      deviceInfo: {},
      isDownloading: false,
      lineChart: undefined,
      currentStartHour: 0,
      currentEndHour: 12,
      disableMinus: true,
      disablePlus: false,
      isSending: false
    }
  },

  methods: {
    async downloadData () {
      this.isDownloading = true

      // reset the charts stuff in case it has been partially filled
      storedData = []
      pieChartConfig.reset()
      lineChart.reset()

      this.startDate = await this.getDateToUseForDownload()
      try {
        this.deviceInfo = await miband3.getDeviceInfo()
        await miband3.getStoredData(this.startDate, this.dataCallback)

        try {
          await miband3.disconnect()
        } catch (err) {
          // doesn't matter if it fails here, but let's print out a message on console
          console.error('cannot disconnect miband3', err)
        }

        if (storedData.length < minimumDataRequired) { // If less than 30 minutes of data exists, show page which describes to little data is found, wait and come back next time.
          await this.storeDownloadDate(this.startDate) // by storing this, we make sure to retrieve the data from the time the data was not enough instead of from today - period (which depends on when the user performs the task)
          // TODO: should we also store that the task is completed?
          this.$router.push({ name: 'notEnoughDataPage' })
          return
        }

        this.createPieChart()
        this.renderLineChart(this.currentStartHour, this.currentEndHour)
        this.isDownloading = false
      } catch (err) {
        console.error('cannot download data', err)
        this.showErrorDialog() // TODO: Retry if the device is disconnected? The retry won't accomplish anything in this case and is confusing from a user perspective. ?? Retry moves to Connect page, make sure i am disconnected.
      }
    },
    async storeDownloadDate (date) {
      // Update task
      let consentedTask = await db.getStudyParticipationTaskItemConsent(this.studyKey, this.taskId)
      consentedTask.lastMiband3SampleTS = date
      await db.setStudyParticipationTaskItemConsent(this.studyKey, this.taskId, consentedTask)
      return consentedTask
    },
    getLatestDownloadedSampleDate () {
      return storedData[storedData.length - 1].date
    },
    /**
     * Retreives the latest date the data was downloaded
     * or if it's the first time it uses the scheduling information
     */
    async getDateToUseForDownload () {
      let startDate
      let consentedTask = await db.getStudyParticipationTaskItemConsent(this.studyKey, this.taskId)
      let latestSampleTS = consentedTask.lastMiband3SampleTS
      if (latestSampleTS) {
        startDate = new Date(latestSampleTS)
      } else {
        const taskDescription = await db.getTaskDescription(this.studyKey, this.taskId)
        let lastExecuted = taskDescription.lastExecuted
        if (lastExecuted) {
          startDate = new Date(lastExecuted)
        } else {
          // use the scheduling information
          startDate = moment()
          let intervalType = taskDescription.scheduling.intervalType
          let interval = taskDescription.scheduling.interval
          if (intervalType === 'd') {
            startDate.subtract(interval, 'days')
          } else if (intervalType === 'w') {
            startDate.subtract(interval, 'weeks')
          } else if (intervalType === 'm') {
            startDate.subtract(interval, 'months')
          } else if (intervalType === 'y') {
            startDate.subtract(interval, 'years')
          }
          startDate = startDate.toDate()
        }
      }
      return startDate
    },
    /**
    * Renders the line chart data between the two specific parameters, end and start in hours.
    * The parameters are converted to minutes. And because there is a stored sample
    * minute by minute in the storedData, the start and end time are re-calculated in minutes
    * and this will be the indexes of the corresponding samples.
    */
    renderLineChart (startTime, endTime) {
      lineChart.reset()
      let startIndexInMinutes = startTime * 60
      let endIndexInMinutes = endTime * 60 - 1
      if (endIndexInMinutes >= storedData.length) {
        endIndexInMinutes = storedData.length - 1
      }
      for (let i = startIndexInMinutes; i <= endIndexInMinutes; i++) {
        let data = storedData[i]
        this.addToLineChart(data.hr, data.intensity, data.steps, data.date)
      }
      this.updateLineChartReferences()
      this.updatePlusMinusButtons() // Could be placed somewhere else but is needed at start in case data size < 12 hours worth
    },

    showErrorDialog () {
      this.$q.dialog({
        title: this.$t('errors.error'),
        message: this.$t('studies.tasks.miband3.dataDownloadError'),
        cancel: this.$t('common.cancel'),
        ok: this.$t('common.retry'),
        persistent: true
      }).onOk(() => {
        // retry
        this.downloadData()
      }).onCancel(() => {
        // cancel and go home
        this.cancelTask()
      })
    },

    async cancelTask () {
      // disconnects and go home
      try {
        await miband3.disconnect()
      } catch (err) {
        // doesn't matter if it fails here, but let's print out a message on console
        console.error('cannot disconnect miband3', err)
      }
      this.$router.push({ name: 'tasker' })
    },
    dataCallback (data) {
      // collects data from the miband and prepares the charts
      storedData.push(data)
    },

    addToLineChart (hr, intensity, steps, date) {
      if (hr > 30 && hr < 210) {
        // filter out unreasonable HR
        lineChart.hrs.push({ x: date, y: hr })
      }
      lineChart.intensities.push({ x: date, y: intensity })
      lineChart.steps.push({ x: date, y: steps })
      lineChart.labels.push(date)
    },

    createPieChart () {
      // create the configuration object
      for (const datapoint of storedData) {
        let activityType = datapoint.activityType
        let name = getStringIdentifier(activityType)
        if (pieChartConfig.indexes[name] === undefined) {
          pieChartConfig.maxIndex++
          let index = pieChartConfig.maxIndex
          pieChartConfig.indexes[name] = index
          pieChartConfig.data.datasets[0].data[index] = 1
          pieChartConfig.data.datasets[0].backgroundColor[index] = chartColors[index]
          pieChartConfig.data.labels.push(this.$t('studies.tasks.miband3.activityTypes.' + name))
        } else {
          let index = pieChartConfig.indexes[name]
          pieChartConfig.data.datasets[0].data[index]++
        }
      }
      // create the chart
      let pieCtx = this.$refs.pieChart
      new Chart(pieCtx, pieChartConfig)
    },

    updateLineChartReferences () {
      this.lineChart.data.datasets[0].data = lineChart.hrs
      this.lineChart.data.datasets[1].data = lineChart.intensities
      this.lineChart.data.datasets[2].data = lineChart.steps
      this.lineChart.data.labels = lineChart.labels
      this.lineChart.update()
    },

    createActivityLineChart () {
      let lineCtx = this.$refs.lineChart
      this.lineChart = new Chart.Scatter(lineCtx, {
        type: 'scatter',
        data: {
          labels: lineChart.labels,
          datasets: [
            {
              label: this.$t('studies.tasks.miband3.hrs'),
              data: lineChart.hrs,
              backgroundColor: '#C74038',
              borderColor: '#C74038',
              borderWidth: 0,
              pointRadius: 1,
              fill: false,
              lineTension: 0
            },
            {
              label: this.$t('studies.tasks.miband3.intensities'),
              data: lineChart.intensities,
              backgroundColor: '#4038C7',
              borderColor: '#4038C7',
              borderWidth: 0,
              pointRadius: 1,
              fill: false,
              lineTension: 0
            },
            {
              label: this.$t('studies.tasks.miband3.steps'),
              data: lineChart.steps,
              backgroundColor: '#38C740',
              borderColor: '#38C740',
              borderWidth: 0,
              pointRadius: 1,
              fill: false,
              lineTension: 0
            }
          ]
        },
        options: {
          responsive: true,
          title: {
            display: false
          },
          scales: {
            xAxes: [{
              type: 'time',
              time: {
                displayFormats: {
                  quarter: 'HH:MM:SS'
                }
              },
              scaleLabel: {
                display: true,
                lineChartLabelstring: 'Date'
              }
            }],
            yAxes: [{
              scaleLabel: {
                display: true,
                lineChartLabelstring: 'value'
              }
            }]
          }
        }
      })
      this.lineChart.update()
    },
    lineChartAdd (amount) {
      this.currentStartHour += amount
      this.currentEndHour += amount
      this.renderLineChart(this.currentStartHour, this.currentEndHour)
      this.updatePlusMinusButtons()
    },
    updatePlusMinusButtons () {
      if (this.currentStartHour === 0) {
        this.disableMinus = true
      } else {
        this.disableMinus = false
      }
      if (this.currentEndHour >= (storedData.length / 60)) {
        this.disablePlus = true
      } else {
        this.disablePlus = false
      }
    },
    async discard () {
      this.isSending = true
      let studyKey = this.studyKey
      let taskId = Number(this.taskId)
      try {
        await this.storeDownloadDate(this.getLatestDownloadedSampleDate())
        await API.sendMiBand3Data({
          userKey: userinfo.user._key,
          studyKey: studyKey,
          taskId: taskId,
          createdTS: new Date(),
          miband3Data: 'discarded'
        })
        await db.setTaskCompletion(studyKey, taskId, new Date())
        this.$router.push({ name: 'home' })
      } catch (error) {
        this.isSending = false
        console.error(error)
        this.$q.notify({
          color: 'negative',
          message: this.$t('errors.connectionError') + ' ' + error.message,
          icon: 'report_problem'
        })
      }
    },
    async send () {
      this.isSending = true
      try {
        let studyKey = this.studyKey
        let taskId = Number(this.taskId)
        await API.sendMiBand3Data({
          userKey: userinfo.user._key,
          studyKey: studyKey,
          taskId: taskId,
          createdTS: new Date(),
          device: this.deviceInfo,
          miband3Data: storedData
        })
        await db.setTaskCompletion(studyKey, taskId, new Date())
        let newTaskItemConsent = await this.storeDownloadDate(this.getLatestDownloadedSampleDate())
        await API.updateTaskItemConsent(studyKey, taskId, newTaskItemConsent)

        this.isSending = false
        // go back to home page
        this.$router.push({ name: 'home' })
      } catch (error) {
        this.isSending = false
        console.error(error)
        this.$q.notify({
          color: 'negative',
          message: this.$t('errors.connectionError') + ' ' + error.message,
          icon: 'report_problem'
        })
      }
    }
  },
  async mounted () {
    this.createActivityLineChart()
    await this.downloadData()
  },
  async beforeDestroy () {
    try {
      await miband3.disconnect()
    } catch (err) {
      // doesn't matter if it fails here, but let's print out a message on console
      console.error('cannot disconnect miband3', err)
    }
  }
}
</script>
