#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const iconPackage = process.argv[2]
const output = resolve(
  process.argv[3] ?? 'docs/diagrams/prism-aws-production-architecture.svg'
)

if (!iconPackage) {
  throw new Error(
    'Usage: node scripts/generate-aws-architecture.mjs <aws-icon-package.zip> [output.svg]'
  )
}

const svc = 'Architecture-Service-Icons_04302026'
const resource = 'Resource-Icons_04302026'

const iconPaths = {
  users: `${resource}/Res_General-Icons/Res_48_Light/Res_Users_48_Light.svg`,
  office: `${resource}/Res_General-Icons/Res_48_Light/Res_Office-building_48_Light.svg`,
  route53: `${svc}/Arch_Networking-Content-Delivery/64/Arch_Amazon-Route-53_64.svg`,
  cloudfront: `${svc}/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg`,
  apiGateway: `${svc}/Arch_Networking-Content-Delivery/64/Arch_Amazon-API-Gateway_64.svg`,
  alb: `${svc}/Arch_Networking-Content-Delivery/64/Arch_Elastic-Load-Balancing_64.svg`,
  waf: `${svc}/Arch_Security-Identity/64/Arch_AWS-WAF_64.svg`,
  shield: `${svc}/Arch_Security-Identity/64/Arch_AWS-Shield_64.svg`,
  cognito: `${svc}/Arch_Security-Identity/64/Arch_Amazon-Cognito_64.svg`,
  kms: `${svc}/Arch_Security-Identity/64/Arch_AWS-Key-Management-Service_64.svg`,
  secrets: `${svc}/Arch_Security-Identity/64/Arch_AWS-Secrets-Manager_64.svg`,
  guardDuty: `${svc}/Arch_Security-Identity/64/Arch_Amazon-GuardDuty_64.svg`,
  securityHub: `${svc}/Arch_Security-Identity/64/Arch_AWS-Security-Hub_64.svg`,
  cloudwatch: `${svc}/Arch_Management-Tools/64/Arch_Amazon-CloudWatch_64.svg`,
  cloudtrail: `${svc}/Arch_Management-Tools/64/Arch_AWS-CloudTrail_64.svg`,
  xray: `${svc}/Arch_Developer-Tools/64/Arch_AWS-X-Ray_64.svg`,
  appConfig: `${svc}/Arch_Management-Tools/64/Arch_AWS-AppConfig_64.svg`,
  ecs: `${svc}/Arch_Containers/64/Arch_Amazon-Elastic-Container-Service_64.svg`,
  fargate: `${svc}/Arch_Containers/64/Arch_AWS-Fargate_64.svg`,
  ecr: `${svc}/Arch_Containers/64/Arch_Amazon-Elastic-Container-Registry_64.svg`,
  lambda: `${svc}/Arch_Compute/64/Arch_AWS-Lambda_64.svg`,
  stepFunctions: `${svc}/Arch_Application-Integration/64/Arch_AWS-Step-Functions_64.svg`,
  sqs: `${svc}/Arch_Application-Integration/64/Arch_Amazon-Simple-Queue-Service_64.svg`,
  eventBridge: `${svc}/Arch_Application-Integration/64/Arch_Amazon-EventBridge_64.svg`,
  sns: `${svc}/Arch_Application-Integration/64/Arch_Amazon-Simple-Notification-Service_64.svg`,
  aurora: `${svc}/Arch_Databases/64/Arch_Amazon-Aurora_64.svg`,
  rds: `${svc}/Arch_Databases/64/Arch_Amazon-RDS_64.svg`,
  dynamodb: `${svc}/Arch_Databases/64/Arch_Amazon-DynamoDB_64.svg`,
  s3: `${svc}/Arch_Storage/64/Arch_Amazon-Simple-Storage-Service_64.svg`,
  backup: `${svc}/Arch_Storage/64/Arch_AWS-Backup_64.svg`,
  opensearch: `${svc}/Arch_Analytics/64/Arch_Amazon-OpenSearch-Service_64.svg`,
  bedrock: `${svc}/Arch_Artificial-Intelligence/64/Arch_Amazon-Bedrock_64.svg`,
  textract: `${svc}/Arch_Artificial-Intelligence/64/Arch_Amazon-Textract_64.svg`,
}

function loadIcon(path) {
  const svg = execFileSync('unzip', ['-p', iconPackage, path])

  return `data:image/svg+xml;base64,${svg.toString('base64')}`
}

const icons = Object.fromEntries(
  Object.entries(iconPaths).map(([name, path]) => [name, loadIcon(path)])
)

const W = 2600
const H = 1700
const out = []
const esc = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

function push(value) {
  out.push(value)
}

function box(x, y, w, h, title, options = {}) {
  const {
    stroke = '#879196',
    fill = '#ffffff',
    dash = '',
    titleFill = '#ffffff',
    titleColor = '#232f3e',
    radius = 16,
    subtitle,
  } = options
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : ''

  push(
    `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"${dashAttr}/>` +
      `<rect x="${x + 18}" y="${y - 14}" width="${Math.max(150, title.length * 10 + 35)}" height="31" rx="4" fill="${titleFill}" stroke="${stroke}" stroke-width="1.5"/>` +
      `<text x="${x + 32}" y="${y + 7}" class="box-title" fill="${titleColor}">${esc(title)}</text>` +
      (subtitle
        ? `<text x="${x + w - 18}" y="${y + 8}" class="box-subtitle" text-anchor="end">${esc(subtitle)}</text>`
        : '') +
      `</g>`
  )
}

function card(x, y, w, h, icon, lines, options = {}) {
  const {
    fill = '#ffffff',
    stroke = '#d5dbdb',
    iconSize = 58,
    labelSize = 14,
    badge,
    badgeFill = '#e7f4ff',
  } = options
  const labels = Array.isArray(lines) ? lines : [lines]
  const iconX = x + (w - iconSize) / 2
  const iconY = y + 14
  const labelY = iconY + iconSize + 20

  push(`<g class="service-card">`)
  push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`
  )
  if (badge) {
    push(
      `<rect x="${x + w - 45}" y="${y + 7}" width="36" height="20" rx="10" fill="${badgeFill}"/>` +
        `<text x="${x + w - 27}" y="${y + 21}" class="badge" text-anchor="middle">${esc(badge)}</text>`
    )
  }
  push(
    `<image href="${icons[icon]}" x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}"/>`
  )
  push(
    `<text x="${x + w / 2}" y="${labelY}" text-anchor="middle" style="font-size:${labelSize}px" class="service-label">` +
      labels
        .map(
          (line, index) =>
            `<tspan x="${x + w / 2}" dy="${index === 0 ? 0 : 18}">${esc(line)}</tspan>`
        )
        .join('') +
      `</text></g>`
  )
}

function plainCard(x, y, w, h, title, lines, options = {}) {
  const {
    fill = '#ffffff',
    stroke = '#879196',
    titleColor = '#232f3e',
  } = options

  push(
    `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
      `<text x="${x + 16}" y="${y + 27}" class="plain-title" fill="${titleColor}">${esc(title)}</text>` +
      lines
        .map(
          (line, index) =>
            `<text x="${x + 16}" y="${y + 52 + index * 20}" class="plain-line">${esc(line)}</text>`
        )
        .join('') +
      `</g>`
  )
}

function arrow(points, label = '', options = {}) {
  const {
    color = '#52616b',
    dashed = false,
    width = 2.5,
    labelX,
    labelY,
    marker = true,
  } = options
  const d = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
    .join(' ')

  push(
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dashed ? ' stroke-dasharray="9 7"' : ''}${marker ? ` marker-end="url(#arrow-${color.slice(1)})"` : ''}/>` +
      (label
        ? `<g><rect x="${labelX - label.length * 3.7 - 7}" y="${labelY - 15}" width="${label.length * 7.4 + 14}" height="22" rx="5" fill="#ffffff" fill-opacity="0.94"/><text x="${labelX}" y="${labelY}" class="flow-label" text-anchor="middle">${esc(label)}</text></g>`
        : '')
  )
}

push(`<?xml version="1.0" encoding="UTF-8"?>`)
push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">`
)
push(
  `<title id="title">Prism AI Underwriter Agent AWS production architecture</title>`
)
push(
  `<desc id="desc">Production deployment topology across Sydney, Melbourne, and Singapore using AWS official architecture icons.</desc>`
)
push(`<defs>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#232f3e" flood-opacity="0.10"/></filter>
  <marker id="arrow-52616b" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#52616b"/></marker>
  <marker id="arrow-8c4fff" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#8c4fff"/></marker>
  <marker id="arrow-1f73b7" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#1f73b7"/></marker>
  <marker id="arrow-d13212" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#d13212"/></marker>
  <style>
    text{font-family:Amazon Ember,Inter,Arial,sans-serif;fill:#232f3e}
    .title{font-size:34px;font-weight:700}.subtitle{font-size:16px;fill:#52616b}
    .box-title{font-size:15px;font-weight:700;letter-spacing:.3px}.box-subtitle{font-size:13px;fill:#52616b}
    .service-label{font-weight:600;fill:#232f3e}.plain-title{font-size:16px;font-weight:700}.plain-line{font-size:13px;fill:#52616b}
    .flow-label{font-size:12px;font-weight:600;fill:#414d55}.badge{font-size:10px;font-weight:700}.section-note{font-size:12px;fill:#687078}
    .service-card{filter:url(#shadow)}
  </style>
</defs>`)
push(`<rect width="${W}" height="${H}" fill="#fbfcfd"/>`)
push(
  `<text x="48" y="54" class="title">Prism AI Underwriter Agent — AWS Production Architecture</text>`
)
push(
  `<text x="48" y="84" class="subtitle">Primary: Sydney (3 AZ) · Warm standby: Melbourne (≥2 AZ) · Identity replica: Singapore · RTO ≤ 1 hour · RPO ≤ 5 minutes</text>`
)

// Major deployment and concern boundaries.
box(310, 130, 1140, 210, 'GLOBAL EDGE & FRONTEND', {
  stroke: '#1f73b7',
  fill: '#f5faff',
  titleFill: '#edf7ff',
  subtitle: 'three independently deployed applications',
})
box(1480, 130, 440, 210, 'IDENTITY', {
  stroke: '#dd344c',
  fill: '#fff7f8',
  titleFill: '#fff0f2',
  subtitle: 'authentication only',
})
box(310, 390, 1630, 1120, 'PRIMARY REGION — ap-southeast-2 (SYDNEY)', {
  stroke: '#946f00',
  fill: '#fffdf6',
  titleFill: '#fff9e3',
  subtitle: 'Production account · Multi-AZ',
})
box(690, 455, 860, 920, 'VPC — 10.20.0.0/16', {
  stroke: '#8c4fff',
  fill: '#fcf9ff',
  titleFill: '#f5edff',
  subtitle: 'no public application tasks',
})
box(725, 510, 790, 150, 'PRIVATE INGRESS SUBNETS', {
  stroke: '#147eba',
  fill: '#f3faff',
  titleFill: '#eef8ff',
  subtitle: '3 AZ',
})
box(725, 700, 790, 370, 'PRIVATE APPLICATION SUBNETS', {
  stroke: '#147eba',
  fill: '#f3faff',
  titleFill: '#eef8ff',
  subtitle: '3 AZ · no inbound Internet',
})
box(725, 1110, 790, 210, 'ISOLATED DATA SUBNETS', {
  stroke: '#2e7d32',
  fill: '#f5fbf5',
  titleFill: '#ecf8ed',
  subtitle: '3 AZ',
})
box(345, 455, 310, 265, 'REGIONAL ENTRY', {
  stroke: '#8c4fff',
  fill: '#fbf8ff',
  titleFill: '#f4edff',
})
box(345, 760, 310, 570, 'ORCHESTRATION & EVENTS', {
  stroke: '#8c4fff',
  fill: '#fbf8ff',
  titleFill: '#f4edff',
  subtitle: 'managed regional services',
})
box(1580, 455, 325, 875, 'DATA, AI & CONFIG', {
  stroke: '#2e7d32',
  fill: '#f7fcf7',
  titleFill: '#eef9ef',
  subtitle: 'private access where supported',
})
box(30, 390, 245, 560, 'SECURITY', {
  stroke: '#dd344c',
  fill: '#fff8f8',
  titleFill: '#fff0f1',
  subtitle: 'all accounts',
})
box(30, 995, 245, 515, 'OBSERVABILITY & OPS', {
  stroke: '#1f73b7',
  fill: '#f6fbff',
  titleFill: '#edf7ff',
  subtitle: 'centralized',
})
box(1985, 390, 585, 430, 'EXTERNAL SYSTEMS', {
  stroke: '#687078',
  fill: '#fafafa',
  titleFill: '#f5f5f5',
  subtitle: 'allowlisted egress',
})
box(1985, 870, 585, 400, 'WARM STANDBY — ap-southeast-4 (MELBOURNE)', {
  stroke: '#946f00',
  fill: '#fffdf6',
  titleFill: '#fff9e3',
  subtitle: 'Recovery account · ≥2 AZ',
})
box(1985, 1315, 585, 195, 'IDENTITY DR — ap-southeast-1 (SINGAPORE)', {
  stroke: '#dd344c',
  fill: '#fff7f8',
  titleFill: '#fff0f2',
  subtitle: 'read-only MRR replica',
})

// Flow lines are deliberately below nodes, so the service cards remain readable.
arrow(
  [
    [190, 230],
    [350, 230],
  ],
  'HTTPS',
  { labelX: 270, labelY: 218 }
)
arrow(
  [
    [475, 230],
    [520, 230],
  ],
  'DNS',
  { labelX: 497, labelY: 218 }
)
arrow(
  [
    [645, 230],
    [690, 230],
  ],
  'protected',
  { labelX: 667, labelY: 218 }
)
arrow(
  [
    [815, 230],
    [860, 230],
  ],
  'origin',
  { labelX: 837, labelY: 218 }
)
arrow(
  [
    [1105, 230],
    [1480, 230],
  ],
  'OIDC / SAML',
  { labelX: 1290, labelY: 218 }
)
arrow(
  [
    [1587, 295],
    [1587, 360],
    [560, 360],
    [560, 500],
  ],
  'JWT issuer',
  {
    labelX: 1120,
    labelY: 348,
    color: '#1f73b7',
  }
)
arrow(
  [
    [945, 295],
    [945, 375],
    [435, 375],
    [435, 500],
  ],
  'API calls',
  {
    labelX: 760,
    labelY: 372,
    color: '#1f73b7',
  }
)
arrow(
  [
    [615, 570],
    [790, 570],
  ],
  'VPC Link',
  { labelX: 705, labelY: 558 }
)
arrow(
  [
    [930, 585],
    [1010, 585],
  ],
  'private',
  { labelX: 970, labelY: 573 }
)
arrow(
  [
    [1120, 660],
    [1120, 745],
  ],
  'route',
  { labelX: 1150, labelY: 708 }
)
arrow(
  [
    [1040, 860],
    [1180, 860],
  ],
  'typed tasks',
  { labelX: 1110, labelY: 848, color: '#8c4fff' }
)
arrow(
  [
    [1290, 950],
    [1290, 1170],
  ],
  'persist first',
  { labelX: 1340, labelY: 1088 }
)
arrow(
  [
    [1180, 950],
    [610, 950],
  ],
  'task token callback',
  {
    labelX: 870,
    labelY: 938,
    color: '#8c4fff',
  }
)
arrow(
  [
    [900, 860],
    [620, 860],
  ],
  'start / signal',
  { labelX: 760, labelY: 848, color: '#8c4fff' }
)
arrow(
  [
    [500, 1000],
    [500, 965],
  ],
  'events',
  { labelX: 540, labelY: 985, color: '#8c4fff' }
)
arrow(
  [
    [500, 1145],
    [760, 1145],
    [760, 1000],
  ],
  'work queues',
  {
    labelX: 650,
    labelY: 1133,
    color: '#8c4fff',
  }
)
arrow(
  [
    [1040, 875],
    [1040, 1170],
  ],
  'transaction + outbox',
  { labelX: 985, labelY: 1090 }
)
arrow(
  [
    [1450, 860],
    [1630, 860],
  ],
  'documents / AI',
  { labelX: 1540, labelY: 848 }
)
arrow(
  [
    [1450, 920],
    [1995, 620],
  ],
  'controlled egress',
  { labelX: 1730, labelY: 790 }
)
arrow(
  [
    [1450, 965],
    [1995, 725],
  ],
  'bind / notify',
  { labelX: 1760, labelY: 920 }
)
arrow(
  [
    [1055, 1285],
    [1055, 1400],
    [1958, 1400],
    [1958, 850],
    [2307, 850],
    [2307, 920],
  ],
  'Aurora Global Database',
  {
    labelX: 1510,
    labelY: 1388,
    color: '#1f73b7',
    dashed: true,
  }
)
arrow(
  [
    [1740, 635],
    [1958, 635],
    [1958, 840],
    [2462, 840],
    [2462, 920],
  ],
  'S3 cross-region replication',
  {
    labelX: 2240,
    labelY: 828,
    color: '#1f73b7',
    dashed: true,
  }
)
arrow(
  [
    [1672, 985],
    [1958, 985],
    [1958, 1250],
    [2307, 1250],
    [2307, 1200],
  ],
  'rebuild indexes',
  {
    labelX: 2130,
    labelY: 1238,
    color: '#1f73b7',
    dashed: true,
  }
)
arrow(
  [
    [1587, 295],
    [1958, 295],
    [1958, 1295],
    [2112, 1295],
    [2112, 1350],
  ],
  'Cognito MRR',
  {
    labelX: 2050,
    labelY: 1283,
    color: '#d13212',
    dashed: true,
  }
)

// Actors and global edge.
card(55, 165, 135, 130, 'users', ['Broker', 'Underwriter', 'Administrator'], {
  iconSize: 54,
  labelSize: 12,
})
card(350, 165, 125, 130, 'route53', ['Amazon', 'Route 53'])
card(520, 165, 125, 130, 'waf', ['AWS WAF', '+ Shield'])
card(690, 165, 125, 130, 'cloudfront', ['3 CloudFront', 'distributions'])
card(860, 165, 245, 130, 's3', [
  'S3 frontend origins',
  'broker · underwriter · admin',
])
card(1510, 165, 155, 130, 'cognito', ['Amazon Cognito', 'primary user pool'])
card(1700, 165, 185, 130, 'office', [
  'Enterprise IdPs',
  'SAML / OIDC federation',
])

// Security and operations.
card(55, 435, 90, 118, 'waf', ['WAF'])
card(160, 435, 90, 118, 'shield', ['Shield'])
card(55, 580, 90, 118, 'kms', ['KMS', 'domain keys'], { labelSize: 12 })
card(160, 580, 90, 118, 'secrets', ['Secrets', 'Manager'], { labelSize: 12 })
card(55, 725, 90, 118, 'guardDuty', ['GuardDuty'], { labelSize: 11 })
card(160, 725, 90, 118, 'securityHub', ['Security', 'Hub'], { labelSize: 12 })
plainCard(
  55,
  862,
  195,
  65,
  'Controls',
  ['SCP · IAM · Config · Security Lake'],
  {
    fill: '#fffdfd',
    stroke: '#ef9a9a',
  }
)
card(55, 1040, 90, 118, 'cloudwatch', ['CloudWatch'], { labelSize: 11 })
card(160, 1040, 90, 118, 'xray', ['X-Ray'])
card(55, 1185, 90, 118, 'cloudtrail', ['CloudTrail'], { labelSize: 11 })
card(160, 1185, 90, 118, 'backup', ['AWS', 'Backup'], { labelSize: 12 })
plainCard(55, 1330, 195, 145, 'Operational model', [
  'ADOT traces, logs and metrics',
  'central Log Archive account',
  'alarms → on-call / SIEM',
  'cross-account backup vault',
])

// Regional entry and managed orchestration.
card(375, 500, 115, 145, 'apiGateway', ['REST API', 'Regional'])
card(515, 500, 115, 145, 'apiGateway', ['WebSocket', 'API'])
card(375, 805, 115, 130, 'eventBridge', ['EventBridge', 'event bus'])
card(515, 805, 115, 130, 'lambda', ['Workflow', 'starter'])
card(375, 985, 255, 135, 'stepFunctions', [
  'Step Functions Standard',
  'Evaluation · Documents · Binding',
])
card(375, 1160, 255, 135, 'sqs', [
  'Workload-specific SQS + DLQ',
  'typed task envelopes',
])

// VPC ingress and application/data planes.
card(790, 535, 140, 105, 'alb', ['Internal ALB'])
plainCard(
  1010,
  535,
  430,
  105,
  'Core API routes',
  ['Broker BFF · Underwriter BFF · Admin BFF', 'one private ALB target group'],
  { fill: '#ffffff', stroke: '#90caf9' }
)

plainCard(
  755,
  745,
  220,
  285,
  'Availability Zone A',
  ['Private application subnet', 'ECS task ENIs', 'VPC endpoints / NAT egress'],
  { fill: '#fbfdff', stroke: '#90caf9' }
)
plainCard(
  995,
  745,
  220,
  285,
  'Availability Zone B',
  ['Private application subnet', 'ECS task ENIs', 'VPC endpoints / NAT egress'],
  { fill: '#fbfdff', stroke: '#90caf9' }
)
plainCard(
  1235,
  745,
  250,
  285,
  'Availability Zone C',
  ['Private application subnet', 'ECS task ENIs', 'VPC endpoints / NAT egress'],
  { fill: '#fbfdff', stroke: '#90caf9' }
)
card(
  790,
  790,
  250,
  170,
  'ecs',
  ['ECS Fargate Core API', 'modular monolith · Multi-AZ'],
  {
    iconSize: 66,
    badge: 'HA',
  }
)
card(
  1180,
  790,
  270,
  170,
  'fargate',
  [
    'ECS Fargate Worker Fleet',
    'document · AI/RAG · external',
    'binding · outbox relay',
  ],
  {
    iconSize: 66,
    labelSize: 13,
    badge: 'HA',
  }
)
card(760, 1150, 145, 135, 'rds', ['RDS Proxy', 'connection pool'])
card(930, 1150, 250, 135, 'aurora', [
  'Aurora PostgreSQL',
  'writer + readers · truth + outbox',
])
card(1205, 1150, 270, 135, 'opensearch', [
  'OpenSearch Serverless',
  'private collection endpoint',
])
plainCard(
  760,
  1335,
  715,
  25,
  '',
  ['Interface/gateway VPC endpoints: S3 · ECR · CloudWatch · Secrets · SQS'],
  {
    fill: '#f5edff',
    stroke: '#c5a3ff',
  }
)

// Regional storage, AI and configuration services.
card(1610, 500, 125, 135, 's3', ['S3 documents', '+ evidence'])
card(1760, 500, 125, 135, 's3', ['S3 artifacts', '+ audit archive'])
card(1610, 675, 125, 135, 'textract', ['Amazon', 'Textract'])
card(1760, 675, 125, 135, 'bedrock', ['Amazon', 'Bedrock'])
card(1610, 850, 125, 135, 'opensearch', ['RAG vector', 'indexes'])
card(1760, 850, 125, 135, 'dynamodb', ['WebSocket', 'connections'])
card(1610, 1025, 125, 135, 'ecr', ['Amazon ECR', 'signed images'])
card(1760, 1025, 125, 135, 'appConfig', ['AppConfig', 'feature flags'])
card(
  1610,
  1200,
  275,
  95,
  'sns',
  ['Notifications + async analytics', 'off the critical underwriting path'],
  {
    iconSize: 48,
    labelSize: 12,
  }
)

// External systems and recovery regions.
card(2025, 445, 135, 135, 'office', ['Government /', 'registry data'])
card(2190, 445, 135, 135, 'office', ['Claims / fraud', 'providers'])
card(2355, 445, 175, 135, 'office', ['Approved SaaS', 'model providers'])
plainCard(
  2025,
  625,
  235,
  145,
  'Policy Administration',
  [
    'quote acceptance → binding',
    'idempotent policy issuance',
    'unknown outcomes → ops hold',
  ],
  { fill: '#ffffff', stroke: '#9e9e9e' }
)
plainCard(
  2290,
  625,
  240,
  145,
  'Notification channels',
  ['email / SMS / webhooks', 'analytics consumers', 'enterprise SIEM'],
  { fill: '#ffffff', stroke: '#9e9e9e' }
)

plainCard(
  2025,
  920,
  190,
  300,
  'Regional entry',
  [
    'Route 53 failover',
    'Regional REST API',
    'warm ECS Core API',
    'warm worker services',
    'private VPC across ≥2 AZ',
  ],
  { fill: '#ffffff', stroke: '#d6b656' }
)
card(2240, 920, 135, 135, 'aurora', ['Aurora Global', 'secondary'])
card(2395, 920, 135, 135, 's3', ['Replicated', 'S3 buckets'])
card(2240, 1080, 135, 120, 'opensearch', ['Rebuilt', 'indexes'])
card(2395, 1080, 135, 120, 'backup', ['Recovery', 'vault'])
card(2040, 1350, 145, 125, 'cognito', ['Cognito MRR', 'replica'])
plainCard(
  2215,
  1350,
  315,
  125,
  'Failover boundary',
  [
    'Sydney Cognito remains primary',
    'Singapore replica is read-only until promotion',
    'Melbourne is not a Cognito MRR region',
  ],
  { fill: '#ffffff', stroke: '#ef9a9a' }
)

// Legend and architecture invariants.
plainCard(
  310,
  1545,
  2260,
  115,
  'Architecture invariants',
  [
    'Core API commits the immutable Submission and outbox event before any workflow starts. Step Functions never calls Core API as an internal HTTP hop.',
    'Workers consume typed SQS tasks, persist results in Aurora/S3, then return the Callback Task Token. AI produces evidence-backed recommendations; deterministic rules and humans retain authority.',
    'Solid arrow = runtime flow · Purple = orchestration/callback · Blue dashed = cross-region replication · Red dashed = identity replication.',
  ],
  { fill: '#ffffff', stroke: '#879196' }
)

push(
  `<text x="2580" y="1685" text-anchor="end" class="section-note">AWS Architecture Icons package: 2026-04-30 · Diagram generated from confirmed target architecture</text>`
)
push(`</svg>`)

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${out.join('\n')}\n`)
process.stdout.write(`${output}\n`)
