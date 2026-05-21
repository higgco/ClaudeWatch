pipeline {
  agent any

  options {
    timestamps()
  }

  parameters {
    choice(
      name: 'ENVIRONMENT',
      choices: ['development', 'staging', 'production'],
      description: 'Target environment'
    )
  }

  environment {
    REGION       = 'us-west-2'
    SERVICE_NAME = 'claudewatch'
  }

  stages {
    stage('Configure') {
      steps {
        script {
          def envConfig = [
            development: [
              profile:   'dev-account',
              accountId: '753025320351',
              healthUrl: 'https://claudewatch.development.worldly.io/'
            ],
            staging: [
              profile:   'sac-staging',
              accountId: '', // TODO: add when environment is provisioned
              healthUrl: ''
            ],
            production: [
              profile:   'sac-prod',
              accountId: '', // TODO: add when environment is provisioned
              healthUrl: ''
            ]
          ]

          def cfg = envConfig[params.ENVIRONMENT]
          if (!cfg.accountId?.trim()) {
            error "ClaudeWatch ${params.ENVIRONMENT} is not configured yet"
          }

          env.AWS_PROFILE  = cfg.profile
          env.AWS_ARGS     = cfg.profile?.trim() ? "--profile ${cfg.profile}" : ''
          env.ACCOUNT_ID   = cfg.accountId
          env.ECR_REGISTRY = "${cfg.accountId}.dkr.ecr.${env.REGION}.amazonaws.com"
          env.ECR_REPO     = "${env.ECR_REGISTRY}/${env.SERVICE_NAME}-${params.ENVIRONMENT}"
          env.SERVICE      = "${env.SERVICE_NAME}-${params.ENVIRONMENT}"
          env.IMAGE_TAG    = "${params.ENVIRONMENT}-${env.BUILD_NUMBER}-${env.GIT_COMMIT ? env.GIT_COMMIT.take(7) : 'manual'}"
          env.LOCAL_IMAGE  = "${env.SERVICE_NAME}:${env.IMAGE_TAG}"
          env.HEALTH_URL   = cfg.healthUrl
        }
      }
    }

    stage('Build') {
      steps {
        sh 'docker build --platform linux/amd64 -t "$LOCAL_IMAGE" .'
      }
    }

    stage('Validate image') {
      steps {
        sh '''
          docker run --rm --entrypoint sh "$LOCAL_IMAGE" -lc 'sqlite3 --version'
          docker run --rm --entrypoint node "$LOCAL_IMAGE" -e "require('sql.js'); console.log('sql.js ok')"
        '''
      }
    }

    stage('Push') {
      steps {
        sh '''
          aws ecr get-login-password --region "$REGION" $AWS_ARGS \
            | docker login --username AWS --password-stdin "$ECR_REGISTRY"
          docker tag "$LOCAL_IMAGE" "${ECR_REPO}:${IMAGE_TAG}"
          docker tag "$LOCAL_IMAGE" "${ECR_REPO}:latest"
          docker push "${ECR_REPO}:${IMAGE_TAG}"
          docker push "${ECR_REPO}:latest"
        '''
      }
    }

    stage('Deploy') {
      steps {
        script {
          def instanceId = sh(
            script: """
              aws ec2 describe-instances \
                --filters 'Name=tag:Name,Values=${env.SERVICE}' 'Name=instance-state-name,Values=running' \
                --query 'Reservations[0].Instances[0].InstanceId' \
                --output text \
                --region ${env.REGION} \
                ${env.AWS_ARGS}
            """,
            returnStdout: true
          ).trim()

          if (!instanceId || instanceId == 'None') {
            error "No running instance found for ${env.SERVICE}"
          }

          writeFile file: 'ssm-commands.json', text: """
{
  "commands": [
    "set -euo pipefail",
    "cd /opt/claudewatch",
    "aws ecr get-login-password --region ${env.REGION} | docker login --username AWS --password-stdin ${env.ECR_REGISTRY}",
    "docker compose pull app",
    "docker compose up -d app nginx",
    "docker exec claudewatch-app-1 sqlite3 --version",
    "docker exec claudewatch-app-1 node -e \\"require('sql.js'); console.log('sql.js ok')\\"",
    "curl -fsS http://localhost:80/ >/dev/null"
  ]
}
"""

          def commandId = sh(
            script: """
              aws ssm send-command \
                --instance-ids '${instanceId}' \
                --document-name 'AWS-RunShellScript' \
                --parameters file://ssm-commands.json \
                --timeout-seconds 180 \
                --region ${env.REGION} \
                ${env.AWS_ARGS} \
                --query 'Command.CommandId' \
                --output text
            """,
            returnStdout: true
          ).trim()

          sh """
            aws ssm wait command-executed \
              --command-id '${commandId}' \
              --instance-id '${instanceId}' \
              --region ${env.REGION} \
              ${env.AWS_ARGS}

            aws ssm get-command-invocation \
              --command-id '${commandId}' \
              --instance-id '${instanceId}' \
              --region ${env.REGION} \
              ${env.AWS_ARGS} \
              --query '{Status:Status,ResponseCode:ResponseCode,Output:StandardOutputContent,Error:StandardErrorContent}' \
              --output json
          """
        }
      }
    }

    stage('Health check') {
      when {
        expression { return env.HEALTH_URL?.trim() }
      }
      steps {
        sh 'curl -fsS --retry 10 --retry-delay 3 --connect-timeout 5 "$HEALTH_URL" >/dev/null'
      }
    }
  }

  post {
    always {
      sh '''
        docker rmi "${LOCAL_IMAGE:-}" "${ECR_REPO:-}:${IMAGE_TAG:-}" "${ECR_REPO:-}:latest" 2>/dev/null || true
        rm -f ssm-commands.json
      '''
    }
  }
}
