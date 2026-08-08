package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	BuildsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "storehubx_builds_total",
		Help: "Total number of build jobs, by terminal status (success|error).",
	}, []string{"status"})

	BuildDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "storehubx_build_duration_seconds",
		Help:    "Time from a build job starting to it reaching a terminal state.",
		Buckets: prometheus.ExponentialBuckets(1, 2, 12), // 1s .. ~68m
	})

	BuildQueueDepth = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "storehubx_build_queue_depth",
		Help: "Number of build jobs currently queued (not yet running).",
	})
)
