pipeline {
  agent any

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
              profile:   'sac-dev',
              accountId: '753025320351'
            ],
            staging: [
              profile:   'sac-staging',
              accountId: '' // TODO: add when environment is provisioned
            ],
            production: [
              profile:   'sac-prod',
              accountId: '' // TODO: add when environment is provisioned
            ]
          ]

          def cfg = envConfig[params.ENVIRONMENT]
          env.AWS_PROFILE  = cfg.profile
          env.ACCOUNT_ID   = cfg.accountId
          env.ECR_REGISTRY = "${cfg.accountId}.dkr.ecr.${env.REGION}.amazonaws.com"
          env.ECR_REPO     = "${env.ECR_REGISTRY}/${env.SERVICE_NAME}-${params.ENVIRONMENT}"
          env.SERVICE      = "${env.SERVICE_NAME}-${params.ENVIRONMENT}"
          env.IMAGE_TAG    = "${params.ENVIRONMENT}-${env.BUILD_NUMBER}"
        }
      }
    }

    stage('Build') {
      steps {
        sh "docker build --platform linux/amd64 -t ${SERVICE_NAME}:${IMAGE_TAG} ."
      }
    }

    stage('Push') {
      steps {
        sh """
          aws ecr get-login-password --region ${REGION} --profile ${AWS_PROFILE} \
            | docker login --username AWS --password-stdin ${ECR_REGISTRY}
          docker tag ${SERVICE_NAME}:${IMAGE_TAG} ${ECR_REPO}:${IMAGE_TAG}
          docker tag ${SERVICE_NAME}:${IMAGE_TAG} ${ECR_REPO}:latest
          docker push ${ECR_REPO}:${IMAGE_TAG}
          docker push ${ECR_REPO}:latest
        """
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
                --profile ${env.AWS_PROFILE}
            """,
            returnStdout: true
          ).trim()

          if (!instanceId || instanceId == 'None') {
            error "No running instance found for ${env.SERVICE}"
          }

          sh """
            aws ssm send-command \
              --instance-ids '${instanceId}' \
              --document-name 'AWS-RunShellScript' \
              --parameters 'commands=["cd /opt/claudewatch && aws ecr get-login-password --region ${env.REGION} | docker login --username AWS --password-stdin ${env.ECR_REGISTRY} && docker compose pull app && docker compose up -d app"]' \
              --timeout-seconds 120 \
              --region ${env.REGION} \
              --profile ${env.AWS_PROFILE}
          """
        }
      }
    }
  }

  post {
    always {
      sh "docker rmi ${SERVICE_NAME}:${IMAGE_TAG} || true"
    }
  }
}
